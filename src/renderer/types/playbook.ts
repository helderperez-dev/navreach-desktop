
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
    | 'use_target_list' | 'use_segment' | 'generate_targets' | 'filter_targets' | 'capture_leads' // Target
    | 'navigate' | 'analyze' | 'extract' | 'scroll' | 'click' | 'type' // Browser
    | 'x_advanced_search' | 'x_scout' | 'x_engage' | 'x_scan_posts' | 'x_post' | 'x_profile' | 'x_dm' | 'x_switch_tab' | 'x_analyze_notifications'; // X tools

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
