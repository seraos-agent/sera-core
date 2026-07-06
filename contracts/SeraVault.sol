// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
}

/**
 * @title SeraVault
 * @dev Agentic Smart Contract Treasury for Base Mainnet.
 * Stores funds securely. Only allows the Owner or the assigned Agent to route funds out.
 * Captures TVL and on-chain Transaction Volume.
 */
contract SeraVault {
    // ─── Immutable Project Identity ───
    string public constant PROJECT_BASENAME = "seraos.base.eth";
    string public constant BUILDER_TAG = "bc_5ks53hsb";
    
    // ─── State ────────────────────────
    address public owner;
    address public agent;

    // ─── Events ───────────────────────
    event AgentUpdated(address indexed newAgent);
    event FundsRouted(address indexed token, address indexed to, uint256 amount);
    event Deposited(address indexed sender, uint256 amount);

    // ─── Modifiers ────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }

    modifier onlyAgentOrOwner() {
        require(msg.sender == agent || msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Allows the vault to receive native ETH directly
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @dev Assigns the Agent EOA that is allowed to spend from this Vault.
     */
    function setAgent(address _agent) external onlyOwner {
        agent = _agent;
        emit AgentUpdated(_agent);
    }

    /**
     * @dev Executes a transfer from the Vault to a recipient.
     * @param token Address of the token (use address(0) for Native ETH)
     * @param to Recipient address
     * @param amount Amount to send
     */
    function executeTransfer(address token, address to, uint256 amount) external onlyAgentOrOwner {
        require(to != address(0), "Invalid recipient");
        
        if (token == address(0)) {
            // Native ETH transfer
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            // ERC20 Transfer
            require(IERC20(token).transfer(to, amount), "ERC20 transfer failed");
        }
        
        emit FundsRouted(token, to, amount);
    }
    
    /**
     * @dev Emergency withdraw by owner
     */
    function withdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = owner.call{value: amount}("");
            require(success, "ETH withdraw failed");
        } else {
            require(IERC20(token).transfer(owner, amount), "ERC20 withdraw failed");
        }
    }
}
