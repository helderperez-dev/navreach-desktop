
import {
    Play, Square, HelpCircle, Repeat, Clock,
    List, Sparkles, Filter,
    Globe, Search, MessageCircle, FileText,
    Cpu, Webhook, MousePointer,
    CheckCircle, PauseCircle,
    Heart, Reply, Send, UserPlus, MessagesSquare, MoveDown, Wand2, Users, User,
    Eye, Terminal, Layers, Download
} from 'lucide-react';
import { PlaybookNodeType } from '@/types/playbook';

export const NODE_CATEGORIES = {
    CONTROL: 'Control',
    TARGET: 'Target source',
    ACTION: 'Action',
    BROWSER: 'Browser',
    X: 'X (Twitter)',
    REDDIT: 'Reddit',
    LINKEDIN: 'LinkedIn',
    INSTAGRAM: 'Instagram',
    BLUESKY: 'Bluesky',
    CAPABILITY: 'Capability',
    HITL: 'Human in the Loop'
};

export interface NodeTypeDefinition {
    type: PlaybookNodeType;
    label: string;
    category: string;
    icon: any;
    description: string;
    color: string;
    inputs: number; // 0, 1, or more (simplified validity check)
    outputs: number;
    outputs_schema?: { label: string; value: string; example?: string }[];
}

export const NODE_DEFINITIONS: Record<PlaybookNodeType, NodeTypeDefinition> = {
    start: {
        type: 'start',
        label: 'Start',
        category: NODE_CATEGORIES.CONTROL,
        icon: Play,
        description: 'Entry point of the playbook',
        color: 'bg-primary/10 text-primary',
        inputs: 0,
        outputs: 1
    },
    end: {
        type: 'end',
        label: 'End',
        category: NODE_CATEGORIES.CONTROL,
        icon: Square,
        description: 'Successful completion',
        color: 'bg-primary/10 text-primary',
        inputs: 1,
        outputs: 0
    },
    condition: {
        type: 'condition',
        label: 'Condition',
        category: NODE_CATEGORIES.CONTROL,
        icon: HelpCircle,
        description: 'Branch based on logic',
        color: 'bg-primary/10 text-primary',
        inputs: 1,
        outputs: 2 // True/False handles handled in component
    },
    loop: {
        type: 'loop',
        label: 'Loop',
        category: NODE_CATEGORIES.CONTROL,
        icon: Repeat,
        description: 'Iterate over items',
        color: 'bg-primary/10 text-primary',
        inputs: 1,
        outputs: 2,
        outputs_schema: [
            { label: 'Current Item', value: 'item', example: '{ id: "123", content: "..." }' },
            { label: 'Current Index', value: 'index', example: '0' }
        ]
    },
    wait: {
        type: 'wait',
        label: 'Wait',
        category: NODE_CATEGORIES.CONTROL,
        icon: Clock,
        description: 'Delay execution',
        color: 'bg-primary/10 text-primary',
        inputs: 1,
        outputs: 1
    },
    use_target_list: {
        type: 'use_target_list',
        label: 'Use List',
        category: NODE_CATEGORIES.TARGET,
        icon: List,
        description: 'Load targets from database',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    generate_targets: {
        type: 'generate_targets',
        label: 'Generate',
        category: NODE_CATEGORIES.TARGET,
        icon: Sparkles,
        description: 'AI generated targets',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    filter_targets: {
        type: 'filter_targets',
        label: 'Filter',
        category: NODE_CATEGORIES.TARGET,
        icon: Filter,
        description: 'Refine target list',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    capture_leads: {
        type: 'capture_leads',
        label: 'Capture Leads',
        category: NODE_CATEGORIES.TARGET,
        icon: Download,
        description: 'Save found leads to database',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    navigate: {
        type: 'navigate',
        label: 'Navigate',
        category: NODE_CATEGORIES.BROWSER,
        icon: Globe,
        description: 'Go to URL',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    analyze: {
        type: 'analyze',
        label: 'Analyze',
        category: NODE_CATEGORIES.BROWSER,
        icon: Search,
        description: 'Analyze page content',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Analysis Result', value: 'analysis', example: 'This post is about...' },
            { label: 'Confidence', value: 'confidence', example: '0.95' }
        ]
    },
    scroll: {
        type: 'scroll',
        label: 'Scroll',
        category: NODE_CATEGORIES.BROWSER,
        icon: MoveDown,
        description: 'Scroll the page',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    extract: {
        type: 'extract',
        label: 'Extract',
        category: NODE_CATEGORIES.BROWSER,
        icon: FileText,
        description: 'Scrape data',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    browser_accessibility_tree: {
        type: 'browser_accessibility_tree',
        label: 'AX Tree',
        category: NODE_CATEGORIES.BROWSER,
        icon: Layers,
        description: 'Analyze semantic structure',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    browser_inspect: {
        type: 'browser_inspect',
        label: 'Inspect',
        category: NODE_CATEGORIES.BROWSER,
        icon: Search,
        description: 'Deep element analysis',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    browser_highlight: {
        type: 'browser_highlight',
        label: 'Highlight',
        category: NODE_CATEGORIES.BROWSER,
        icon: Eye,
        description: 'Visually mark elements',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    browser_console_logs: {
        type: 'browser_console_logs',
        label: 'Logs',
        category: NODE_CATEGORIES.BROWSER,
        icon: Terminal,
        description: 'Get page errors/logs',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    browser_grid: {
        type: 'browser_grid',
        label: 'Grid',
        category: NODE_CATEGORIES.BROWSER,
        icon: List,
        description: 'Overlay coordinate grid',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    x_advanced_search: {
        type: 'x_advanced_search',
        label: 'X Search',
        category: NODE_CATEGORIES.X,
        icon: Search,
        description: 'Advanced search for posts on X',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Search Results', value: 'items', example: '[{ id: "123", text: "..." }]' },
            { label: 'Total Count', value: 'count', example: '50' }
        ]
    },
    x_scout: {
        type: 'x_scout',
        label: 'X Scout',
        category: NODE_CATEGORIES.X,
        icon: Globe,
        description: 'Scout Niches, Communities, or Competitor Audiences',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Accounts Found', value: 'accounts', example: '@founder1 @indie_maker' },
            { label: 'Trending Topics', value: 'topics', example: '#saas #ai' }
        ]
    },
    x_profile: {
        type: 'x_profile',
        label: 'X Profile',
        category: NODE_CATEGORIES.X,
        icon: User,
        description: 'Qualify leads or check your identity.',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Handle', value: 'handle', example: '@elonmusk' },
            { label: 'Followers', value: 'followers', example: '100000' },
            { label: 'Bio', value: 'bio', example: 'Tech Fan' },
            { label: 'Is Verified', value: 'is_verified', example: 'true' }
        ]
    },
    x_post: {
        type: 'x_post',
        label: 'X Post',
        category: NODE_CATEGORIES.X,
        icon: Send,
        description: 'Create a new post on X',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },

    x_engage: {
        type: 'x_engage',
        label: 'X Engage',
        category: NODE_CATEGORIES.X,
        icon: MessagesSquare,
        description: 'Multi-action engagement on X',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },
    x_scan_posts: {
        type: 'x_scan_posts',
        label: 'X Scan',
        category: NODE_CATEGORIES.X,
        icon: Eye,
        description: 'Identify 10-15 posts and authors in one go',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Posts Found', value: 'posts', example: '[{ author: "@user", text: "..." }]' },
            { label: 'Total Count', value: 'count', example: '12' }
        ]
    },
    reddit_search: {
        type: 'reddit_search',
        label: 'Reddit Search',
        category: NODE_CATEGORIES.REDDIT,
        icon: Search,
        description: 'Search Reddit',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1
    },
    reddit_scout_community: {
        type: 'reddit_scout_community',
        label: 'Scout Sub',
        category: NODE_CATEGORIES.REDDIT,
        icon: Users,
        description: 'Scout a Subreddit',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1
    },
    reddit_vote: {
        type: 'reddit_vote',
        label: 'Reddit Vote',
        category: NODE_CATEGORIES.REDDIT,
        icon: Heart,
        description: 'Up/Down vote',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1
    },
    reddit_comment: {
        type: 'reddit_comment',
        label: 'Reddit Comment',
        category: NODE_CATEGORIES.REDDIT,
        icon: MessageCircle,
        description: 'Comment or Reply',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1
    },
    reddit_join: {
        type: 'reddit_join',
        label: 'Reddit Join',
        category: NODE_CATEGORIES.REDDIT,
        icon: UserPlus,
        description: 'Join/Leave Subreddit',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1
    },
    reddit_scan_posts: {
        type: 'reddit_scan_posts',
        label: 'Reddit Scan',
        category: NODE_CATEGORIES.REDDIT,
        icon: Eye,
        description: 'Scan visible posts on Reddit',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Posts Found', value: 'posts', example: '[{ author: "user", title: "..." }]' },
            { label: 'Total Count', value: 'count', example: '12' }
        ]
    },
    // LinkedIn Nodes
    linkedin_search: {
        type: 'linkedin_search',
        label: 'LI Search',
        category: NODE_CATEGORIES.LINKEDIN,
        icon: Search,
        description: 'Search LinkedIn',
        color: 'bg-[#0077b5]/10 text-[#0077b5]',
        inputs: 1,
        outputs: 1
    },
    linkedin_connect: {
        type: 'linkedin_connect',
        label: 'LI Connect',
        category: NODE_CATEGORIES.LINKEDIN,
        icon: UserPlus,
        description: 'Connect with user',
        color: 'bg-[#0077b5]/10 text-[#0077b5]',
        inputs: 1,
        outputs: 1
    },
    linkedin_message: {
        type: 'linkedin_message',
        label: 'LI Message',
        category: NODE_CATEGORIES.LINKEDIN,
        icon: Send,
        description: 'Send direct message',
        color: 'bg-[#0077b5]/10 text-[#0077b5]',
        inputs: 1,
        outputs: 1
    },
    // Instagram Nodes
    instagram_post: {
        type: 'instagram_post',
        label: 'IG Post',
        category: NODE_CATEGORIES.INSTAGRAM,
        icon: Send,
        description: 'Create new post',
        color: 'bg-[#E1306C]/10 text-[#E1306C]',
        inputs: 1,
        outputs: 1
    },
    instagram_engage: {
        type: 'instagram_engage',
        label: 'IG Engage',
        category: NODE_CATEGORIES.INSTAGRAM,
        icon: Heart,
        description: 'Like or Comment',
        color: 'bg-[#E1306C]/10 text-[#E1306C]',
        inputs: 1,
        outputs: 1
    },
    // Bluesky Nodes
    bluesky_post: {
        type: 'bluesky_post',
        label: 'BSKY Post',
        category: NODE_CATEGORIES.BLUESKY,
        icon: Send,
        description: 'Post to Bluesky',
        color: 'bg-[#0560FF]/10 text-[#0560FF]',
        inputs: 1,
        outputs: 1
    },
    bluesky_reply: {
        type: 'bluesky_reply',
        label: 'BSKY Reply',
        category: NODE_CATEGORIES.BLUESKY,
        icon: Reply,
        description: 'Reply to post',
        color: 'bg-[#0560FF]/10 text-[#0560FF]',
        inputs: 1,
        outputs: 1
    },
    mcp_call: {
        type: 'mcp_call',
        label: 'MCP Call',
        category: NODE_CATEGORIES.CAPABILITY,
        icon: Cpu,
        description: 'Call external tool',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    api_call: {
        type: 'api_call',
        label: 'API Call',
        category: NODE_CATEGORIES.CAPABILITY,
        icon: Webhook,
        description: 'HTTP Request',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    browser_action: {
        type: 'browser_action',
        label: 'Browser Act',
        category: NODE_CATEGORIES.CAPABILITY,
        icon: MousePointer,
        description: 'Low-level action',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    // Recording / Advanced Browser Nodes
    browser_click: {
        type: 'browser_click',
        label: 'Rec. Click',
        category: NODE_CATEGORIES.BROWSER,
        icon: MousePointer,
        description: 'Recorded Click',
        color: 'bg-green-500/10 text-green-500',
        inputs: 1,
        outputs: 1
    },
    browser_type: {
        type: 'browser_type',
        label: 'Rec. Type',
        category: NODE_CATEGORIES.BROWSER,
        icon: MessagesSquare, // or Keyboard icon if available
        description: 'Recorded Input',
        color: 'bg-green-500/10 text-green-500',
        inputs: 1,
        outputs: 1
    },
    browser_navigate: {
        type: 'browser_navigate',
        label: 'Rec. Nav',
        category: NODE_CATEGORIES.BROWSER,
        icon: Globe,
        description: 'Recorded Navigation',
        color: 'bg-green-500/10 text-green-500',
        inputs: 1,
        outputs: 1
    },
    browser_scrape: {
        type: 'browser_scrape',
        label: 'HTML Scrape',
        category: NODE_CATEGORIES.BROWSER,
        icon: FileText,
        description: 'Cheerio Scrape',
        color: 'bg-purple-500/10 text-purple-500',
        inputs: 1,
        outputs: 1
    },
    browser_replay: {
        type: 'browser_replay',
        label: 'Replay Rec.',
        category: NODE_CATEGORIES.BROWSER,
        icon: Terminal,
        description: 'Replay Chrome Recorder JSON',
        color: 'bg-green-500/10 text-green-500',
        inputs: 1,
        outputs: 1
    },

    approval: {
        type: 'approval',
        label: 'Approval',
        category: NODE_CATEGORIES.HITL,
        icon: CheckCircle,
        description: 'Wait for human',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    pause: {
        type: 'pause',
        label: 'Pause',
        category: NODE_CATEGORIES.HITL,
        icon: PauseCircle,
        description: 'Pause execution',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    }
};
