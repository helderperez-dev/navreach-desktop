
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
    workspace_id?: string;
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
    speed: 'slow' | 'normal' | 'fast';
    model?: string;
}

export type PlaybookNodeType =
    | 'start' | 'end' | 'condition' | 'loop' | 'wait' // Control
    | 'use_target_list' | 'generate_targets' | 'filter_targets' | 'capture_leads' // Target
    | 'navigate' | 'analyze' | 'extract' | 'scroll' | 'browser_accessibility_tree' | 'browser_inspect' | 'browser_highlight' | 'browser_console_logs' | 'browser_grid' // Action
    | 'x_advanced_search' | 'x_scout' | 'x_engage' | 'x_scan_posts' | 'x_post' | 'x_profile' // X tools
    | 'reddit_search' | 'reddit_scout_community' | 'reddit_vote' | 'reddit_comment' | 'reddit_join' | 'reddit_scan_posts' // Reddit tools
    | 'linkedin_search' | 'linkedin_connect' | 'linkedin_message' // LinkedIn
    | 'instagram_post' | 'instagram_engage' // Instagram
    | 'bluesky_post' | 'bluesky_reply' // Bluesky
    | 'mcp_call' | 'api_call' | 'browser_action' // Capability
    | 'browser_click' | 'browser_type' | 'browser_navigate' | 'browser_scrape' | 'browser_replay' // Recording/Advanced
    | 'approval' | 'pause'; // HITL

// Base config interface, specific nodes will extend or use this
export interface PlaybookNodeConfig {
    [key: string]: any;
}

export interface CreatePlaybookDTO {
    name: string;
    description: string;
    version?: string;
    graph: PlaybookGraph;
    capabilities: PlaybookCapabilities;
    execution_defaults: PlaybookExecutionDefaults;
    workspace_id?: string;
}

export interface UpdatePlaybookDTO {
    name?: string;
    description?: string;
    version?: string;
    graph?: PlaybookGraph;
    capabilities?: PlaybookCapabilities;
    execution_defaults?: PlaybookExecutionDefaults;
}
