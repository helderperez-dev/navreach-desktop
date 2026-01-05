export interface TargetList {
    id: string;
    name: string;
    description: string | null;
    user_id: string;
    workspace_id: string;
    created_at: string;
    updated_at: string;
    target_count?: number;
}

export type TargetType = 'profile' | 'company' | 'post' | 'lead' | 'other';

export interface Target {
    id: string;
    list_id: string;
    name: string;
    type: TargetType;
    url: string;
    email?: string | null;
    tags: string[];
    metadata: Record<string, any>;
    created_at: string;
    last_interaction_at?: string;
    status?: string;
}

export interface CreateTargetListInput {
    name: string;
    description?: string;
    user_id: string;
    workspace_id: string;
}

export interface CreateTargetInput {
    list_id: string;
    name: string;
    type: TargetType;
    url: string;
    email?: string | null;
    tags?: string[];
    metadata?: Record<string, any>;
    user_id?: string;
}
