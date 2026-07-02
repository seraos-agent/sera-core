// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SeraRegistry
 * @dev Registry for SERA Agentic Wallets on Base Mainnet.
 * Connects an Agent to its Human Owner and stamps the project basename.
 */
contract SeraRegistry {
    // ─── Immutable Project Identity ───
    string public constant PROJECT_BASENAME = "seraos.base.eth";
    
    // ─── State Variables ──────────────
    mapping(address => address) public agentToOwner;
    mapping(address => address[]) public ownerToAgents;

    // ─── Events ───────────────────────
    event AgentRegistered(address indexed agent, address indexed owner);

    // ─── Logic ────────────────────────
    
    /**
     * @dev Registers the msg.sender (Agent Wallet) to its Owner.
     * @param owner The address of the human owner.
     */
    function registerAgent(address owner) external {
        require(owner != address(0), "Invalid owner address");
        require(agentToOwner[msg.sender] == address(0), "Agent already registered");
        
        agentToOwner[msg.sender] = owner;
        ownerToAgents[owner].push(msg.sender);
        
        emit AgentRegistered(msg.sender, owner);
    }

    /**
     * @dev Get all agents owned by an address.
     */
    function getAgentsByOwner(address owner) external view returns (address[] memory) {
        return ownerToAgents[owner];
    }
}
