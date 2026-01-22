
export interface Workspace {
    id: string;
    name: string;
    owner_id: string;
    created_at: string;
    updated_at: string;
    settings: {
        disabledTools?: string[];
        disabledMCPServers?: string[];
        customModelProviders?: any[]; // For future workspace-specific keys
    };
    auto_profile_analysis?: boolean;
}

export interface WorkspaceMember {
    workspace_id: string;
    user_id: string;
    role: 'owner' | 'member' | 'admin';
    created_at: string;
}
