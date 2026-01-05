export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "13.0.5"
    }
    public: {
        Tables: {
            credit_balances: {
                Row: {
                    balance: number
                    created_at: string
                    id: string
                    updated_at: string
                    user_id: string
                }
                Insert: {
                    balance?: number
                    created_at?: string
                    id?: string
                    updated_at?: string
                    user_id: string
                }
                Update: {
                    balance?: number
                    created_at?: string
                    id?: string
                    updated_at?: string
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "credit_balances_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: true
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            credit_transactions: {
                Row: {
                    amount: number
                    created_at: string
                    description: string | null
                    id: string
                    metadata: Json | null
                    stripe_payment_intent_id: string | null
                    type: string
                    user_id: string
                }
                Insert: {
                    amount: number
                    created_at?: string
                    description?: string | null
                    id?: string
                    metadata?: Json | null
                    stripe_payment_intent_id?: string | null
                    type: string
                    user_id: string
                }
                Update: {
                    amount?: number
                    created_at?: string
                    description?: string | null
                    id?: string
                    metadata?: Json | null
                    stripe_payment_intent_id?: string | null
                    type: string
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "credit_transactions_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            playbooks: {
                Row: {
                    ai_summary: string | null
                    capabilities: string[] | null
                    created_at: string
                    description: string | null
                    execution_defaults: Json | null
                    graph: Json
                    id: string
                    is_favorite: boolean | null
                    last_run_at: string | null
                    name: string
                    tags: string[] | null
                    updated_at: string
                    user_id: string
                    visibility: string
                    workspace_id: string | null
                }
                Insert: {
                    ai_summary?: string | null
                    capabilities?: string[] | null
                    created_at?: string
                    description?: string | null
                    execution_defaults?: Json | null
                    graph: Json
                    id?: string
                    is_favorite?: boolean | null
                    last_run_at?: string | null
                    name: string
                    tags?: string[] | null
                    updated_at?: string
                    user_id: string
                    visibility?: string
                    workspace_id?: string | null
                }
                Update: {
                    ai_summary?: string | null
                    capabilities?: string[] | null
                    created_at?: string
                    description?: string | null
                    execution_defaults?: Json | null
                    graph?: Json
                    id?: string
                    is_favorite?: boolean | null
                    last_run_at?: string | null
                    name?: string
                    tags?: string[] | null
                    updated_at?: string
                    user_id?: string
                    visibility?: string
                    workspace_id?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "playbooks_workspace_id_fkey"
                        columns: ["workspace_id"]
                        isOneToOne: false
                        referencedRelation: "workspaces"
                        referencedColumns: ["id"]
                    },
                ]
            }
            profiles: {
                Row: {
                    avatar_url: string | null
                    created_at: string
                    email: string | null
                    full_name: string | null
                    id: string
                    updated_at: string
                }
                Insert: {
                    avatar_url?: string | null
                    created_at?: string
                    email?: string | null
                    full_name?: string | null
                    id: string
                    updated_at?: string
                }
                Update: {
                    avatar_url?: string | null
                    created_at?: string
                    email?: string | null
                    full_name?: string | null
                    id?: string
                    updated_at?: string
                }
                Relationships: []
            }
            target_lists: {
                Row: {
                    created_at: string
                    description: string | null
                    id: string
                    name: string
                    updated_at: string
                    user_id: string
                    workspace_id: string | null
                }
                Insert: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    name: string
                    updated_at?: string
                    user_id?: string
                    workspace_id?: string | null
                }
                Update: {
                    created_at?: string
                    description?: string | null
                    id?: string
                    name?: string
                    updated_at?: string
                    user_id?: string
                    workspace_id?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "target_lists_workspace_id_fkey"
                        columns: ["workspace_id"]
                        isOneToOne: false
                        referencedRelation: "workspaces"
                        referencedColumns: ["id"]
                    },
                ]
            }
            targets: {
                Row: {
                    created_at: string
                    data: Json | null
                    id: string
                    list_id: string
                    status: string
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    data?: Json | null
                    id?: string
                    list_id: string
                    status?: string
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    data?: Json | null
                    id?: string
                    list_id?: string
                    status?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "targets_list_id_fkey"
                        columns: ["list_id"]
                        isOneToOne: false
                        referencedRelation: "target_lists"
                        referencedColumns: ["id"]
                    },
                ]
            }
            workspace_members: {
                Row: {
                    created_at: string
                    role: string
                    user_id: string
                    workspace_id: string
                }
                Insert: {
                    created_at?: string
                    role?: string
                    user_id: string
                    workspace_id: string
                }
                Update: {
                    created_at?: string
                    role?: string
                    user_id?: string
                    workspace_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "workspace_members_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "workspace_members_workspace_id_fkey"
                        columns: ["workspace_id"]
                        isOneToOne: false
                        referencedRelation: "workspaces"
                        referencedColumns: ["id"]
                    },
                ]
            }
            workspaces: {
                Row: {
                    created_at: string
                    id: string
                    name: string
                    owner_id: string
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    id?: string
                    name: string
                    owner_id: string
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    id?: string
                    name?: string
                    owner_id?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "workspaces_owner_id_fkey"
                        columns: ["owner_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof Database
    }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
