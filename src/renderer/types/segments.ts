export type FilterOperator =
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'starts_with'
    | 'ends_with'
    | 'is_empty'
    | 'is_not_empty'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'not_in';

export interface FilterCondition {
    id: string;
    field: string;
    operator: FilterOperator;
    value: any;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'metadata';
    metadataKey?: string; // If field is 'metadata'
}

export interface TargetSegment {
    id: string;
    user_id: string;
    workspace_id: string;
    name: string;
    description: string | null;
    filters: FilterCondition[];
    created_at: string;
    updated_at: string;
    target_count?: number;
}

export interface CreateSegmentInput {
    name: string;
    description?: string;
    filters: FilterCondition[];
}
