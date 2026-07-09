/**
 * Communication Capability — Platform-Agnostic Types
 * 
 * ARCHITECTURAL RULE:
 * These types define the universal language for ALL communication platforms.
 * The word "Slack", "Discord", "Teams" must NEVER appear in these type definitions.
 * Platform identity is carried as metadata (string), not as structural types.
 * 
 * Identity Resolution:
 * Every external user, channel, and workspace is resolved to a platform-agnostic
 * identity at the adapter boundary. Core only sees UniversalIdentity objects.
 */

// ── Identity Resolution ──────────────────────────────────────────────────────

/**
 * Universal identity for any user across any platform.
 * The adapter is responsible for constructing this from platform-specific data.
 * Core never parses platformUserId — it treats it as opaque.
 */
export interface UserIdentity {
  /** Platform-agnostic composite key: `${platform}:${platformUserId}` */
  id: string;
  /** The platform this user belongs to (e.g. 'slack', 'discord', 'email') */
  platform: string;
  /** Raw platform-specific user ID (opaque to Core) */
  platformUserId: string;
  /** Human-readable display name */
  displayName: string;
  /** Whether this user is the SERA operator/owner */
  isOwner?: boolean;
}

/**
 * Universal identity for any channel/conversation across any platform.
 */
export interface ChannelIdentity {
  /** Platform-agnostic composite key: `${platform}:${platformChannelId}` */
  id: string;
  /** The platform this channel belongs to */
  platform: string;
  /** Raw platform-specific channel ID (opaque to Core) */
  platformChannelId: string;
  /** Human-readable channel name */
  name: string;
  /** Whether this is a 1:1 direct message channel */
  isDirectMessage: boolean;
  /** Approximate member count (for governance decisions) */
  memberCount?: number;
}

/**
 * Universal identity for a workspace/organization.
 */
export interface WorkspaceIdentity {
  /** Platform-agnostic composite key: `${platform}:${platformWorkspaceId}` */
  id: string;
  platform: string;
  platformWorkspaceId: string;
  name: string;
}

// ── Observation Types ────────────────────────────────────────────────────────

/**
 * A platform-agnostic observation from any communication platform.
 * This is the universal object that Core sees — never a raw Slack/Discord event.
 */
export interface CommunicationObservation {
  /** The text content of the message */
  message: string;
  /** Which platform this originated from */
  platform: string;
  /** Resolved identity of the sender */
  sender: UserIdentity;
  /** Resolved identity of the channel */
  channel: ChannelIdentity;
  /** Resolved identity of the workspace */
  workspace: WorkspaceIdentity;
  /** Thread/reply context (platform-agnostic reference) */
  threadRef?: string;
  /** Whether SERA was explicitly mentioned/invoked */
  isMention: boolean;
  /** Whether this is a direct message to SERA */
  isDirectMessage: boolean;
  /** Original platform timestamp (opaque to Core, used for response routing) */
  platformTimestamp?: string;
}

// ── Action Types ─────────────────────────────────────────────────────────────

/**
 * A platform-agnostic action that SERA wants to perform on a communication platform.
 */
export interface CommunicationAction {
  /** Target platform */
  platform: string;
  /** Target channel identity */
  channelId: string;
  /** Thread to reply in (if applicable) */
  threadRef?: string;
  /** The message text to send */
  text: string;
  /** Optional structured content (blocks, embeds, cards — adapter translates) */
  richContent?: Record<string, any>;
}

// ── Response Context ─────────────────────────────────────────────────────────

/**
 * Carries routing information through the cognitive pipeline.
 * Born at observation time, passed through DialogueEngine untouched,
 * consumed by CommunicationBridge to route the response back.
 */
export interface ResponseContext {
  platform: string;
  channelId: string;
  threadRef?: string;
  /** Original sender (for governance: who triggered this action) */
  senderId?: string;
}

// ── Adapter Interface ────────────────────────────────────────────────────────

/**
 * The contract that every platform adapter must implement.
 * 
 * ARCHITECTURAL RULE:
 * No cognitive logic shall exist inside any implementation of this interface.
 * Adapters are translators, not thinkers.
 */
export interface ICommunicationAdapter {
  /** Unique platform identifier (e.g. 'slack', 'discord') */
  readonly platform: string;

  /** Send a message to the platform */
  sendMessage(action: CommunicationAction): Promise<{ success: boolean; platformMessageId?: string }>;

  /** Start listening for platform events (called during bootstrap) */
  start(): Promise<void>;

  /** Graceful shutdown */
  stop(): Promise<void>;
}
