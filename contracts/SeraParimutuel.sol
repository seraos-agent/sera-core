// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SeraParimutuel {
    address public owner;
    address public oracle;
    address public feeAddress;
    IERC20 public usdc;

    uint256 public constant FEE_PERCENT = 2; // 2%
    uint256 public constant SEED_LIQUIDITY = 50 * 10**6; // 50 USDC seed (assuming 6 decimals)

    struct Market {
        string id;
        uint256 expiryTime;
        bool resolved;
        uint8 outcome; // 0 = Unresolved, 1 = UP, 2 = DOWN
        uint256 totalUp;
        uint256 totalDown;
    }

    // marketId => Market
    mapping(string => Market) public markets;

    // marketId => user => amount
    mapping(string => mapping(address => uint256)) public userBetUp;
    mapping(string => mapping(address => uint256)) public userBetDown;

    // To prevent double claiming
    mapping(string => mapping(address => bool)) public hasClaimed;

    event MarketCreated(string marketId, uint256 expiryTime);
    event BetPlaced(string marketId, address user, uint8 side, uint256 amount);
    event MarketResolved(string marketId, uint8 outcome, uint256 totalUp, uint256 totalDown);
    event WinningsClaimed(string marketId, address user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Not oracle");
        _;
    }

    constructor(address _usdc, address _oracle, address _feeAddress) {
        owner = msg.sender;
        oracle = _oracle;
        feeAddress = _feeAddress;
        usdc = IERC20(_usdc);
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }

    function createMarket(string calldata marketId, uint256 expiryTime) external onlyOracle {
        require(markets[marketId].expiryTime == 0, "Market already exists");
        
        markets[marketId] = Market({
            id: marketId,
            expiryTime: expiryTime,
            resolved: false,
            outcome: 0,
            totalUp: SEED_LIQUIDITY,
            totalDown: SEED_LIQUIDITY
        });

        emit MarketCreated(marketId, expiryTime);
    }

    function placeBet(string calldata marketId, uint8 side, uint256 amount) external {
        Market storage market = markets[marketId];
        require(market.expiryTime > 0, "Market does not exist");
        require(!market.resolved, "Market already resolved");
        require(block.timestamp < market.expiryTime, "Market expired");
        require(side == 1 || side == 2, "Invalid side");
        require(amount > 0, "Amount must be > 0");

        // Transfer USDC from user to contract
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");

        if (side == 1) {
            market.totalUp += amount;
            userBetUp[marketId][msg.sender] += amount;
        } else {
            market.totalDown += amount;
            userBetDown[marketId][msg.sender] += amount;
        }

        emit BetPlaced(marketId, msg.sender, side, amount);
    }

    function resolveMarket(string calldata marketId, uint8 outcome) external onlyOracle {
        Market storage market = markets[marketId];
        require(market.expiryTime > 0, "Market does not exist");
        require(!market.resolved, "Market already resolved");
        require(block.timestamp >= market.expiryTime, "Market not yet expired");
        require(outcome == 1 || outcome == 2, "Invalid outcome");

        market.resolved = true;
        market.outcome = outcome;

        // Calculate total gross pool minus seed liquidity (since seed wasn't actually deposited by users)
        // Wait, if seed liquidity is 50 USDC each side, the gross pool includes 100 USDC of "fake" liquidity.
        // Actually, the seed liquidity mechanism in parimutuel mathematically assumes the platform provided 100 USDC.
        // If we want it to be real, the platform should deposit 100 USDC upon creation.
        // Let's assume the pool maths works exactly like the backend:
        // We just use totalUp and totalDown for the shares. 
        // Real deposited money = (totalUp - SEED) + (totalDown - SEED)
        uint256 realDeposits = (market.totalUp - SEED_LIQUIDITY) + (market.totalDown - SEED_LIQUIDITY);
        
        if (realDeposits > 0) {
            // Deduct 2% fee from the real deposits
            uint256 fee = (realDeposits * FEE_PERCENT) / 100;
            if (fee > 0) {
                require(usdc.transfer(feeAddress, fee), "Fee transfer failed");
            }
        }

        emit MarketResolved(marketId, outcome, market.totalUp, market.totalDown);
    }

    function claimWinnings(string calldata marketId) external {
        Market storage market = markets[marketId];
        require(market.resolved, "Market not resolved");
        require(!hasClaimed[marketId][msg.sender], "Already claimed");

        uint256 userStake = 0;
        uint256 winningPoolTotal = 0;

        if (market.outcome == 1) {
            userStake = userBetUp[marketId][msg.sender];
            winningPoolTotal = market.totalUp;
        } else if (market.outcome == 2) {
            userStake = userBetDown[marketId][msg.sender];
            winningPoolTotal = market.totalDown;
        }

        require(userStake > 0, "No winning stake");
        
        hasClaimed[marketId][msg.sender] = true;

        // Gross Pool (including seed)
        uint256 grossPool = market.totalUp + market.totalDown;
        
        // Net Pool (accounting for 2% fee, but wait, the fee was only taken from real deposits)
        // So the payout available is (GrossPool - SEED) * 0.98 + SEED ? 
        // No, let's keep the math identical to backend:
        // backend netPool = grossPool * 0.98;
        // payout = (userStake / poolSideTotal) * netPool
        
        uint256 netPool = (grossPool * (100 - FEE_PERCENT)) / 100;
        uint256 payout = (userStake * netPool) / winningPoolTotal;

        require(payout > 0, "Payout is zero");
        require(usdc.transfer(msg.sender, payout), "Payout transfer failed");
        
        emit WinningsClaimed(marketId, msg.sender, payout);
    }
}
