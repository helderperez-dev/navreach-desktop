
import { Edge, Node } from 'reactflow';

export interface Playbook {
    id: string;
    name: string;
    description: string;
    version: string;
    visibility: 'private' | 'shared';
    execution_defaults: PlaybookExecutionDefaults;
    capabilities: PlaybookCapabilities;
    graph: PlaybookGraph;
    created_at: string;
    updated_at: string;
    user_id?: string;
}

export interface PlaybookGraph {
    nodes: Node[];
    edges: Edge[];
    viewport?: { x: number; y: number; zoom: number };
}

export interface PlaybookCapabilities {
    browser: boolean;
    mcp: string[];
    external_api: string[];
}

export interface PlaybookExecutionDefaults {
    mode: 'observe' | 'draft' | 'assist' | 'auto';
    require_approval: boolean;
}

export type PlaybookNodeType =
    | 'start' | 'end' | 'condition' | 'loop' | 'wait' // Control
    | 'use_target_list' | 'generate_targets' | 'filter_targets' // Target
    | 'navigate' | 'analyze' | 'engage' | 'extract' | 'scroll' | 'browser_accessibility_tree' | 'browser_inspect' | 'browser_highlight' | 'browser_console_logs' | 'browser_grid' // Action
    | 'x_search' | 'x_advanced_search' | 'x_scout_topics' | 'x_scout_community' | 'x_like' | 'x_reply' | 'x_post' | 'x_follow' | 'x_engage' // X tools
    | 'reddit_search' | 'reddit_scout_community' | 'reddit_vote' | 'reddit_comment' | 'reddit_join' // Reddit tools
    | 'linkedin_search' | 'linkedin_connect' | 'linkedin_message' // LinkedIn
    | 'instagram_post' | 'instagram_engage' // Instagram
    | 'bluesky_post' | 'bluesky_reply' // Bluesky
    | 'mcp_call' | 'api_call' | 'browser_action' | 'humanize' // Capability
    | 'approval' | 'pause'; // HITL

// Base config interface, specific nodes will extend or use this
export interface PlaybookNodeConfig {
    [key: string]: any;
}

export interface CreatePlaybookDTO {
    name: string;
    description: string;
    graph: PlaybookGraph;
    capabilities: PlaybookCapabilities;
    execution_defaults: PlaybookExecutionDefaults;
}

export interface UpdatePlaybookDTO {
    name?: string;
    description?: string;
    graph?: PlaybookGraph;
    capabilities?: PlaybookCapabilities;
    execution_defaults?: PlaybookExecutionDefaults;
}
