# Vercel dashboard sidebar — observed spec (research 2026-09-26)

Source: research agent `VercelSidebarResearch`, verbatim structured output. Sources S*/V* are listed under `sources`; [INFERENCE]/[UNOBSERVED] flagged inline.

```json
{
  "summary": "Vercel's dashboard sidebar (opt-in beta 2026-01-22, default for everyone 2026-02-26) is contextual in a narrower way than the brief assumes. (1) Team → project is NOT a sidebar swap. The top-level list is nearly identical at both scopes: the first item is 'Projects' at team scope and 'Overview' at project scope, and a few items gain drill chevrons at project scope. Scope is picked with a project switcher in the CONTENT header, where 'All Projects' means team scope (the URL segment `~`). Vercel's changelog calls this 'Projects as filters'. (2) The whole-body swap happens only when you drill into a SECTION that has sub-pages (Observability, Firewall, CDN, Settings, Logs, Flags, Agent, AI Gateway, Sandboxes). The team switcher and Find stay fixed at the top and the user row stays fixed at the bottom. The body is replaced by a '‹ <Section>' row plus that section's items. Top-level items never appear below it. (3) The '‹' back control does NOT navigate: the URL and page stay the same, the sidebar shows the parent list again, and the section you came from stays highlighted. (4) The swap is a quick fade with a slight blur, about 3 frames (~100 ms) in 30 fps video. No slide was seen. (5) Account (/account) and New Project (/new) pages replace the team switcher with a '← Back' link. Deployment detail pages keep the top-level sidebar and use horizontal tabs inside the page.",
  "a_scope_tree": {
    "url_scheme": {
      "team_scope": "/{team} is the landing page ('Projects'). Team-wide sections live under /{team}/~/{section}; '~' stands for all projects. Observed: /tech-guide-pro/~/deployments, /~/analytics, /~/settings, /~/settings/security, /~/connect. Docs deep links: /[team]/~/settings/billing, /~/observability, /~/stores, /~/usage, /~/integrations, /~/domains, /~/ai-gateway [S4, V4, V7, V9, V10, V11, V12]",
      "project_scope": "/{team}/{project} is the landing page ('Overview'). Sections live under /{team}/{project}/{section}, e.g. /analytics, /logs, /firewall, /firewall/traffic, /settings, /settings/deployment-protection, /settings/domains, /observability/runtime-cache [S4, V2, V3, V6, V8, V10, V12]",
      "deployment": "/{team}/{project}/{deploymentId} [V13]",
      "account": "/account [V4]",
      "new_project": "/new [V9, V15]"
    },
    "team_top_level": {
      "items_2026_06_to_09": [
        "Projects (active on /{team})",
        "Deployments",
        "Logs",
        "Analytics",
        "Speed Insights",
        "Observability ›",
        "Firewall",
        "CDN",
        "— divider —",
        "Environment Variables",
        "Domains",
        "Connect [Beta]",
        "Integrations",
        "Storage",
        "Flags",
        "Agent ›",
        "AI Gateway ›",
        "Sandboxes ›",
        "Workflows",
        "— divider —",
        "Usage",
        "Support",
        "Settings ›"
      ],
      "sources": [
        "V2 t≈74s",
        "V4 t≈12s",
        "V14 t≈30s"
      ],
      "note": "At team scope Firewall, CDN and Flags have NO chevron. The list scrolls between the fixed header and the fixed footer. An 'Images [Beta]' item appeared between Workflows and Usage in one July 2026 capture [V8 t≈18.5s]. The list keeps changing: the 2026-03 walkthrough had no CDN, Environment Variables, Connect or Workflows [V1 t≈86s]."
    },
    "project_top_level": {
      "items_2026_06_to_09": [
        "Overview (the project's framework avatar is its icon)",
        "Deployments",
        "Logs (a › appears in some captures)",
        "Analytics",
        "Speed Insights",
        "Observability ›",
        "Firewall ›",
        "CDN ›",
        "— divider —",
        "Environment Variables",
        "Domains",
        "Connect [Beta]",
        "Integrations",
        "Storage",
        "Flags ›",
        "Agent ›",
        "AI Gateway ›",
        "Sandboxes ›",
        "Workflows",
        "— divider —",
        "Usage",
        "Support",
        "Settings ›"
      ],
      "sources": [
        "V2 t≈40s",
        "V6 t≈20s",
        "V12 t≈40s",
        "V13 t≈82s"
      ],
      "march_2026_variant": [
        "Overview",
        "Deployments",
        "Logs",
        "Analytics",
        "Speed Insights",
        "Observability ›",
        "Firewall ›",
        "—",
        "Domains",
        "Integrations",
        "Storage",
        "Flags ›",
        "Agent ›",
        "AI Gateway ›",
        "Sandboxes",
        "—",
        "Usage",
        "Support",
        "Settings ›"
      ],
      "march_source": "V1 t≈186s (Vercel's own walkthrough)",
      "jan_2026_changelog_image": "Overview, Deployments (active), Logs ›, Analytics, Speed Insights, Observability ›, Firewall › … [S1 image]"
    },
    "drill_in_panels": {
      "Observability (project)": [
        "‹ Observability",
        "Overview",
        "Query",
        "Notebooks",
        "Alerts [Beta]",
        "COMPUTE: Functions, External APIs, Middleware, Workflows [Beta], Runtime Cache",
        "CDN: Edge Requests, Fast Data Transfer, Image Optimization, ISR, External Rewrites, Microfrontends, … (list scrolls)"
      ],
      "Observability source": "V1 t≈208s",
      "Firewall (project, Hobby)": [
        "‹ Firewall",
        "Overview",
        "Traffic",
        "Rules",
        "Audit Log"
      ],
      "Firewall Hobby source": "V12 t≈74s",
      "Firewall (project, Enterprise)": [
        "‹ Firewall",
        "Overview",
        "Traffic",
        "Rules",
        "Audit Log",
        "Bot Management [Beta]"
      ],
      "Firewall Enterprise source": "V1 t≈558s",
      "Settings (project, 2026-07)": [
        "‹ Settings",
        "General",
        "Build and Deployment",
        "Environments",
        "Git",
        "Deployment Protection",
        "Passport [Beta]",
        "Functions",
        "Cron Jobs",
        "Microfrontends",
        "Project Members",
        "Drains",
        "Security",
        "Networking",
        "Activity",
        "Advanced"
      ],
      "Settings project sources": "V5 t≈28–40s, V8 t≈20.5s. The 2026-04 list also had 'Environment Variables' between Environments and Git [V7 t≈131s].",
      "Settings (team, 2026-06)": [
        "‹ Settings",
        "General",
        "Billing",
        "Build and Deployment",
        "Invoices",
        "Members",
        "Access Groups",
        "Agent",
        "Drains",
        "Alerts",
        "Webhooks",
        "Security & Privacy",
        "Deployment Protection",
        "Microfrontends",
        "Networking",
        "Activity",
        "My Notifications",
        "Apps"
      ],
      "Settings team source": "V10 t≈40–60s",
      "Logs (project)": "‹ Logs, then 'Filters' with a Reset button, then collapsible filter groups: Timeline (date-range dropdown); Contains Console Level (Warning/Error/Fatal checkboxes, each with a count); Resource; Environment; Route; Request Path; Status Code; Request Type; Host; Request Method; Cache; Branch; Deployment ID; Workflow Run; Workflow Step. Here the drill-in panel holds FILTERS, not links [V3 t≈60–64s; docs: 'You can use the following filters from the sidebar' S5].",
      "AI Gateway / Agent / Flags / CDN / Sandboxes": "Drill-ins exist (they carry a ›) but I did not capture their item lists. Docs mention AI Gateway items 'API Keys', 'Logs' and 'Bring Your Own Key (BYOK)', and CDN → 'Caches' [S5]. [UNOBSERVED item lists]",
      "Account scope (/account)": "Different pattern: '← Back' replaces the team switcher, then Find, Overview, Domains, Activity, Support, a divider, then Settings with its sub-items shown INLINE and indented (Authentication, Sign in with Vercel, Billing Information, Billing Items, Invoices, Tokens). No drill-in [V4 t≈17–65s]."
    },
    "deeper_pages": {
      "deployment_detail": "The sidebar stays at top level with 'Deployments' active. The deployment's own sub-navigation is HORIZONTAL TABS in the page (Deployment, Logs, Resources, Source, Open Graph; the changelog image adds Bundle Sizes). The page header shows the breadcrumb 'Deployments / <id>' [V13 t≈82s, S1 image].",
      "project_domains": "Clicking top-level 'Domains' in a project opens /{project}/settings/domains, but the sidebar stays at top level with Domains active. It does NOT switch to the Settings panel. So the sidebar level comes from a route table, not a URL-prefix match [V11 t≈60s].",
      "team_scope_page_needing_project": "At /{team}/~/analytics the page shows 'Continue to Analytics — Choose a project to continue' with a project picker. Choosing one goes to /{team}/{project}/analytics; the sidebar stays on Analytics and the first item becomes 'Overview' [V14 t≈45–53s].",
      "storage_integration_resources": "Docs describe a separate left navigation on resource pages (Getting Started, Projects, Settings, Usage, Invoices, Resources; for Global Config: Items, Backups, Settings) [S5]. Whether this renders as a sidebar drill-in is [UNOBSERVED]."
    }
  },
  "b_top_region_anatomy": {
    "fixed_header": [
      "Row 1 is the team switcher: team avatar, team name, plan badge pill (Hobby / Pro / Pro Trial / Enterprise) and an up/down chevron (⇕). The whole row is the trigger [S1 image, V1, V2].",
      "Row 2 is the 'Find…' search field with an 'F' keyboard hint on the right [S1 image, V1, V2]. It is not in the scrolling area: the scrollbar starts below it [V3 t≈60s]."
    ],
    "scrolling_body": "Either the top-level list or a drill-in panel. In a panel the '‹ <Section>' row (back chevron on the left, section title centred) is the first item of the scrolling area and scrolls away with it [V3 t≈60–61s]. There are no section headings at top level, only thin dividers; drill-in panels can have small uppercase headings (COMPUTE, CDN) [V1 t≈208s].",
    "fixed_footer": "User avatar and name, a '…' button and a notification bell (with an unread dot) [V1, V2, V5]. A dismissible promo card ('Ship 26… Get your ticket', with ×) can sit just above the footer [V9 t≈37s].",
    "content_header_not_sidebar": "Left: project switcher '<project avatar> <project> ⇕' or 'All Projects ⇕'. Centre: page title (Overview / Analytics / Observability / Logs / Firewall) or a breadcrumb ('Project Settings / Deployment Protection', 'Deployments / <id>'). Right: v0 button and a '…' menu [V1 t≈186s, V5 t≈40s, V13].",
    "collapse_affordance": "Hovering the sidebar's right edge highlights the edge (the resize handle) and shows a small round button with '‹' on it [V8 t≈15s]. The changelog says the sidebar is 'resizable' and 'can be hidden when not needed' [S1, S2].",
    "command_menu": "'Find' is not a full-screen modal. It opens as a popover anchored to the Find field, wider than the sidebar, with an 'Esc' hint, and dims the page. With an empty query it suggests items relevant to where you are (in a project: project Deployments first, then team Deployments, Logs, Analytics, a settings deep link, and an AI 'Navigation Assistant' suggestion). Each result has two lines: a title, and the scope path underneath (e.g. 'nuxt-ai-chatbot / Functions / Settings', 'Account', 'Navigation Assistant'). Typing filters the list and shows a spinner [V9 t≈33–35s, V4 t≈14–16s]. It searches teams, projects, deployments by branch, pages and settings, plus the AI Navigation Assistant [S3]. The 2021 changelog documents ⌘K for the old Command Menu [S6]; I did NOT confirm that ⌘K still works in the 2026 navigation [UNVERIFIED]."
  },
  "c_state_machine": {
    "derived_state": "The sidebar level comes from the URL: route → {scope: team|project|account|new, section, level: top|section-panel, activeItem}. Opening a URL directly or using browser back/forward always rebuilds the sidebar from the URL [V3 t≈45–55s, V7 t≈128–147s].",
    "transitions": [
      {
        "event": "Click a plain item (no ›)",
        "effect": "Go to that section's route. The sidebar stays at top level with the new item highlighted [V1, V11]."
      },
      {
        "event": "Click a drillable item (›)",
        "effect": "Go to the section's landing route (e.g. /settings → General, /observability → Overview, /firewall → Overview). The sidebar swaps to that section's panel IMMEDIATELY, before the page has loaded: at V5 t≈28s the URL was /settings and the Settings panel showed while the page still showed Overview [V1 t≈204.9–205.2s, V5 t≈27–28s]. Hover detail: the row gets a hover background and the › gets its own small rounded background [V1 t≈203–205s]. [INFERENCE] The › may be a separate button that drills without navigating; not confirmed."
      },
      {
        "event": "Click the '‹ <Section>' row (the whole row is clickable and shows a hover background)",
        "effect": "Local view change ONLY. The URL and page stay the same (still /cafe-management/firewall, Firewall page visible). The body cross-fades back to the parent list with the section's item (e.g. Firewall ›) highlighted as current [V12 t≈84–85.5s]."
      },
      {
        "event": "Click the same section again from that parent list",
        "effect": "Drills back into the panel [V12 t≈86–87.5s]."
      },
      {
        "event": "Click another item from that parent list",
        "effect": "Go to that route; the level is recomputed from it. [INFERENCE] Standard link behaviour; not specifically captured."
      },
      {
        "event": "Project switcher: pick a project",
        "effect": "Replaces the project part of the URL (`~` → project) and keeps the section: /{team}/~/analytics → /{team}/{project}/analytics. The sidebar stays top-level with the same item active; 'Projects' becomes 'Overview' [V14 t≈45–53s; S1 'Projects as Filters']."
      },
      {
        "event": "Go to /account or /new",
        "effect": "The team switcher is replaced by '← Back'. /account shows its own list; /new shows no nav list [V4, V15]. [INFERENCE] '← Back' returns to the previous dashboard page."
      },
      {
        "event": "Team switcher: pick a team",
        "effect": "Switches team. 'Create Team' sits at the bottom of the list and the plan shows next to each team name [S4 docs]. [UNOBSERVED] popover contents and which page you land on."
      }
    ],
    "back_semantics_summary": "Two different 'backs'. (1) The in-sidebar '‹ Section' row only moves the sidebar up one level and never changes the URL. (2) '← Back' on /account and /new leaves that page. Browser back always re-syncs the sidebar to the URL.",
    "mermaid": "stateDiagram-v2\n  [*] --> TopLevel: route has no section panel\n  [*] --> SectionPanel: route inside a drillable section\n  TopLevel --> SectionPanel: click › item (navigate to section landing, swap sidebar immediately)\n  SectionPanel --> SectionPanel: click panel item (navigate, panel stays)\n  SectionPanel --> ParentPeek: click ‹ Section (URL unchanged)\n  ParentPeek --> SectionPanel: click same section\n  ParentPeek --> TopLevel: click plain item (navigate)\n  ParentPeek --> SectionPanel: click other › item (navigate)\n  TopLevel --> TopLevel: project switcher (URL project segment changes, same section)\n  SectionPanel --> SectionPanel: project switcher [INFERENCE]"
  },
  "d_dropdown_popover_inventory": [
    {
      "name": "Team switcher",
      "trigger": "Team row at the top of the sidebar (⇕)",
      "contents": "List of teams with plan badges, 'Create Team' at the bottom, a paused icon on paused projects [S4 docs]. [UNOBSERVED visually]",
      "open": "click"
    },
    {
      "name": "Project switcher",
      "trigger": "'<project> ⇕' / 'All Projects ⇕' at top-left of the content header",
      "contents": "'Find Project…' field with 'Esc' hint, projects listed with framework avatars, hover highlight, divider, '+ Create Project' [V14 t≈45s]",
      "open": "click"
    },
    {
      "name": "Find / Navigation Assistant",
      "trigger": "Find field or the F key",
      "contents": "Anchored popover with suggestions for the current scope, two-line results (title + scope path), AI 'Navigation Assistant' entry, Esc to close [V4 t≈14.5s, V9 t≈34.5s, S3]",
      "open": "click / F"
    },
    {
      "name": "User menu",
      "trigger": "User row in the footer ('…')",
      "contents": "Opens upward: name + email with a settings gear; Feedback; Theme (three icon buttons); Home Page; Changelog; Help; Docs; Log Out; 'Upgrade to Pro' button; Platform Status ('All systems normal') [V2 t≈66s]",
      "open": "click"
    },
    {
      "name": "Notifications",
      "trigger": "Bell in the footer",
      "contents": "Notifications, including Comments [S5 docs text: 'select the notification bell icon and open Comments']",
      "open": "click"
    },
    {
      "name": "Add New…",
      "trigger": "Content header on the team Projects page",
      "contents": "Project, Domain, Store, Integration, Team Member [V1 t≈86s]",
      "open": "click"
    },
    {
      "name": "Page filters (in content, not sidebar)",
      "examples": "Environment ('Production ▾'), date range ('Last 12 hours ▾', 'Past Day ▾'), Firewall view picker ('Overview ▾'), deployment status filter [V1 t≈186–208s, V12, S5 'status filter dropdown']",
      "open": "click"
    },
    {
      "name": "Filters inside the sidebar",
      "examples": "Logs panel: collapsible groups with checkboxes and counts, Reset button [V3]",
      "open": "inline expand"
    },
    {
      "name": "Keyboard and open rules from Geist",
      "notes": "Geist Menu: 'Open on click, not hover'; closes on item click, Escape or outside click; arrows, Home/End and type-to-jump; focus returns to the trigger. Geist CommandMenu: ⌘K / Ctrl+K, arrows, Enter, Esc, Backspace on an empty field pops a page [S7, S8]. Observed Vercel popovers show an 'Esc' hint and opened on click [V4, V14]."
    }
  ],
  "e_collapse_motion_responsive": {
    "desktop_collapse": "Official wording: sidebar is 'resizable' and 'can be hidden when not needed' [S1, S2]. Hovering the right edge shows the resize line and a round '‹' button [V8 t≈15s]. [UNOBSERVED] Whether collapse leaves an icon rail or hides the sidebar completely (the wording 'hidden' suggests completely), how you reopen it, any keyboard shortcut, and whether open/closed state or width is saved. Search results claiming Cmd+B and cookie persistence come from shadcn docs, not Vercel; do not rely on them.",
    "mobile": "Official: 'New mobile navigation featuring a floating bottom bar optimized for one-handed use' [S1, S2]. [UNOBSERVED] which items are on it and how drill-ins appear on mobile. Geist Drawer (bottom sheet, small screens only, swipe-down/Esc to dismiss) is the likely primitive for secondary choices on mobile [S9] [INFERENCE].",
    "swap_motion": "Measured frame by frame in 30 fps screen recordings: top-level → Observability panel. Old labels fade and blur while the new header and rows fade in over them, about 3 frames (~100 ms). No horizontal slide; rows stay in place. Settings drill: old list fades to empty for about 1 frame, then the new list fades in over about 2–3 frames (~100–130 ms). The '‹' back is the same cross-fade in reverse [V1 t≈205.0–205.2s, V5 t≈27.4–27.6s, V12 t≈84–86s]. Scroll seems to reset to the top when swapping [V5 t≈27.45s] [LOW-CONFIDENCE]. Exact easing and duration can't be measured at 30 fps [INFERENCE: ≈100–150 ms opacity (+ blur) cross-fade].",
    "note_vs_shadcn_proposal": "The shadcn drill-down proposal cites Vercel but uses a slide (translate-x) [S10]. The recordings of Vercel show a fade, not a slide."
  },
  "f_items_styling": {
    "icons": "16-px outline icons on every top-level item. The Observability, Firewall and Logs panels have icons; the Settings panels have text only [V1, V5, V10, V12].",
    "active": "Filled neutral rounded background plus brighter text, full row width [V1, V2].",
    "hover": "Lighter background. On › items the › gets its own small rounded background [V1 t≈203–205s].",
    "badges_counts": "The only badges in the nav are small blue 'Beta' pills (Connect, Alerts, Workflows, Passport, Bot Management, Images) and the plan pill beside the team name. No number badges on any nav item in any capture. Counts appear only in in-page content ('Review Changes 8', 'Production Checklist 2/6', '3 Recommendations') and in the Logs filter groups [V1, V3, V5, V12].",
    "grouping": "Top level: three groups split by thin dividers (monitoring / platform resources / account-level), no headings. Panels can have uppercase headings [V1, V2].",
    "nesting": "Inline expanding children appear only on the /account Settings list. Everywhere else, sub-pages open as a drill-in panel [V4].",
    "overflow_pins": "No 'More' item, pinned items, favorites or recents in the 2026 sidebar in any capture. The list just scrolls. The Projects page has a 'Recent Previews' card in the page itself [V2, V4]. Favorites existed in the older dashboard (2023 changelog) [S11]; not seen in the new sidebar [UNOBSERVED]."
  },
  "g_settings_subnav": "Settings is not a separate navigation inside the page. The settings sub-navigation IS the sidebar's Settings panel: project or team depending on the URL, text-only items, '‹ Settings' header. The page header shows 'Project Settings / <Page>'. Old docs wording like 'From the left sidebar, click General' now refers to this panel. The main top-level list is hidden while you are in Settings and comes back only through '‹' [V5 t≈40s, V8 t≈20.5s, V10, S5].",
  "sources": {
    "S1": "https://vercel.com/changelog/new-dashboard-navigation-available (2026-01-22; bullet list and hero image with sidebar crop)",
    "S2": "https://vercel.com/changelog/dashboard-navigation-redesign-rollout (2026-02-26; default for all users)",
    "S3": "https://vercel.com/changelog/dashboard-universal-search (2025-06-23; Find + Navigation Assistant)",
    "S4": "https://vercel.com/docs/llms-full.txt (docs text: 'team switcher at the top left', 'Create Team' at the bottom of the switcher, `/[team]/~/…` and `/[team]/[project]/…` deep links); also https://vercel.com/docs/project-configuration/project-settings",
    "S5": "https://vercel.com/docs/llms-full.txt (sidebar wording for Logs filters, AI Gateway items, CDN → Caches, resource left navigation, deployment status filter dropdown)",
    "S6": "https://vercel.com/changelog/quickly-navigate-the-dashboard-with-shortcuts (2021 ⌘K Command Menu)",
    "S7": "https://vercel.com/geist/menu",
    "S8": "https://vercel.com/geist/command-menu",
    "S9": "https://vercel.com/geist/drawer",
    "S10": "https://github.com/shadcn-ui/ui/discussions/10163 (drill-down proposal citing Vercel; uses a slide)",
    "S11": "https://vercel.com/changelog/favorite-teams-and-projects-to-appear-in-your-dashboard (2023)",
    "V1": "https://youtu.be/zFXscjUoDDA (Vercel official 'Product Walkthrough (2026)', 2026-03-16; t≈86, 186, 203–212, 558)",
    "V2": "https://youtu.be/eXTQTuuC-_8 (TechGuidePro, 2026-06-25; t≈40, 66, 74)",
    "V3": "https://youtu.be/syCpfybV-mA (TechGuidePro 'View Vercel Logs', 2026-06-29; t≈30–64)",
    "V4": "https://youtu.be/pW4qvGeYzK4 (TechGuidePro 'Manage Teams', 2026-07-05; t≈12–65)",
    "V5": "https://youtu.be/1R6OMfg5rzE (Jeremiah Tutorials, 2026-07-19; t≈20–40)",
    "V6": "https://youtu.be/pTfn1Qp9WVg (Easy Click Fix, 2026-08-05)",
    "V7": "https://youtu.be/VD8cZo_jPD0 (TUTOR BASE, 2026-04-23; t≈128–148)",
    "V8": "https://youtu.be/KrT_2dirh0A (Jeremiah Tutorials, 2026-07-20; t≈15–20.5)",
    "V9": "https://youtu.be/c9gt8gLsPuk (How To Solve Pro, 2026-06-10; t≈33–37)",
    "V10": "https://youtu.be/QsCqfq1kR1I (TechGuidePro 'API Key', 2026-06-27; t≈40–60)",
    "V11": "https://youtu.be/fLG3yK0l0Y8 (TechGuidePro 'Domains', 2026-06-25; t≈30–60)",
    "V12": "https://youtu.be/7Cz4w_FUkJw (How To With Dean 'Firewall Traffic', 2026-09-01; t≈40, 74–88)",
    "V13": "https://youtu.be/sVUD9oZyLsA (How To With Dean, 2026-09-01; t≈82)",
    "V14": "https://youtu.be/JPav_g1Tr_8 (TechGuidePro, 2026-06-25; t≈43–53)",
    "V15": "https://youtu.be/x0ic_UjXePE (TechGuidePro 'Monorepo', 2026-07-01; /new page)"
  },
  "evidence_method_and_limits": "Observations come from video frames I pulled myself with yt-dlp and ffmpeg. Saved frames are in /tmp/vid, e.g. w_186.jpg, w_208.jpg, g_tq2.png (swap frames), fbk.png (back leaves URL unchanged), ts.png (Find popover), ps_45.png (project switcher). Not verified: team switcher popover contents, the collapsed/hidden state and its persistence, the mobile bottom bar, whether ⌘K still exists, item lists for the AI Gateway/Agent/Flags/CDN/Sandboxes panels, and whether the › and the item label are separate click targets. The item list changes month to month (CDN, Environment Variables, Connect, Workflows and Images were added between March and August 2026)."
}
```
