
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
    | 'navigate' | 'analyze' | 'engage' | 'extract' | 'scroll' // Action
    | 'x_search' | 'x_advanced_search' | 'x_like' | 'x_reply' | 'x_post' | 'x_follow' | 'x_engage' // X tools
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
