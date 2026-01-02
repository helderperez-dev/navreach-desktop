
import BaseNode from './BaseNode';
import { PlaybookNodeType } from '@/types/playbook';

export const nodeTypes: Record<string, any> = {
    start: BaseNode,
    end: BaseNode,
    condition: BaseNode,
    loop: BaseNode,
    wait: BaseNode,
    use_target_list: BaseNode,
    generate_targets: BaseNode,
    filter_targets: BaseNode,
    navigate: BaseNode,
    analyze: BaseNode,
    scroll: BaseNode,
    engage: BaseNode,
    extract: BaseNode,
    x_advanced_search: BaseNode,
    x_scout: BaseNode,
    x_profile: BaseNode,
    x_post: BaseNode,
    x_engage: BaseNode,
    mcp_call: BaseNode,
    api_call: BaseNode,
    browser_action: BaseNode,
    humanize: BaseNode,
    approval: BaseNode,
    pause: BaseNode,

    // Reddit Nodes
    reddit_search: BaseNode,
    reddit_scout_community: BaseNode,
    reddit_vote: BaseNode,
    reddit_comment: BaseNode,
    reddit_join: BaseNode,
    // LinkedIn
    linkedin_search: BaseNode,
    linkedin_connect: BaseNode,
    linkedin_message: BaseNode,
    // Instagram
    instagram_post: BaseNode,
    instagram_engage: BaseNode,
    // Bluesky
    bluesky_post: BaseNode,
    bluesky_reply: BaseNode,

    // Browser Introspection
    browser_inspect: BaseNode,
    browser_highlight: BaseNode,
    browser_accessibility_tree: BaseNode,
    browser_console_logs: BaseNode,
    browser_grid: BaseNode,
    x_scan_posts: BaseNode,
};
