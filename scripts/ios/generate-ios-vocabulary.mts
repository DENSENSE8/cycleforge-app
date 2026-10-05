// Renders the words the native iOS app's Home, Scan, Pair and Unbox chrome
// print as `Sources/CycleForgeDesign/CycleForgeVocabulary.swift`, plus the
// fixture its test holds the Swift to
// (`Tests/CycleForgeDesignTests/Fixtures/web-vocabulary.json`), both written
// into the Mac project (scripts/ios/ios-target.mts). Run from the web repo root:
//
//   node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/ios/generate-ios-vocabulary.mts [--check|--stdout]
//
// Sources, all read — never retyped:
//   VOCABULARY             src/lib/nav/route-tree.ts (the domain words)
//   page titles            getMobileAppTitle (src/lib/mobile-context-navigation.ts)
//   destinations           MOBILE_V2_NAVIGATION_FAMILIES (mobile-v2-destinations.tsx),
//                          in its order, kept only where the app has the screen
//   chrome words           the string literals of the reference components,
//                          each required to appear in its file (a moved or
//                          reworded literal fails the render, never goes stale)
// Deterministic: same web source → byte-identical output.
import { readFileSync } from 'node:fs';
import { MOBILE_V2_NAVIGATION_FAMILIES, type MobileV2Destination } from '@/components/mobile/v2/mobile-v2-destinations';
import { getMobileAppTitle } from '@/lib/mobile-context-navigation';
import { VOCABULARY } from '@/lib/nav/route-tree';
import { deliver } from './ios-target.mts';

const SWIFT_PATH = 'Sources/CycleForgeDesign/CycleForgeVocabulary.swift';
const FIXTURE_PATH = 'Tests/CycleForgeDesignTests/Fixtures/web-vocabulary.json';
const GENERATOR = 'generate-ios-vocabulary.mts';

/**
 * The app's native screens, by the `/m` route they port, and the web
 * destination whose page is their door. Scan is not a destination on the web:
 * it is the scan button every top bar carries (MobileV2ScanCta), so it is not
 * a Home row either.
 */
const NATIVE_SCREENS = [
  // `/m/unbox`'s door is the "Unbox next" link on Receiving (MobileV2ReceivingLive.tsx).
  { screen: 'unbox', href: '/m/unbox', door: 'receiving' },
] as const;

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** The first capture of `pattern` in `file`; the render fails if the literal is gone. */
function literal(file: string, pattern: RegExp): string {
  const match = pattern.exec(read(file));
  if (!match?.[1]) throw new Error(`${file}: the literal ${pattern} is gone — update the generator with the web`);
  return match[1];
}

function term(id: string): string {
  const found = VOCABULARY.filter((entry) => entry.id === id);
  if (found.length === 0) throw new Error(`VOCABULARY has no '${id}'`);
  return found[0].label;
}

const SCAN_HEADER = 'src/components/mobile/scan/MobileScanHeader.tsx';
const SCAN_IDENTIFY = 'src/components/mobile/scan/MobileScanIdentify.tsx';
const CAPTURE = 'src/components/mobile/station/MobileCaptureWindow.tsx';
const PLACEMENT = 'src/components/mobile/v2/receiving/MobileV2ArrivalPlacement.tsx';

/** [Swift name, word, where it is read from]. */
const words: Array<[string, string, string]> = [
  ['appTitle', getMobileAppTitle(null), 'getMobileAppTitle(null) — the product name'],
  ['scanTitle', getMobileAppTitle('/m/scan'), "getMobileAppTitle('/m/scan')"],
  ['unboxTitle', getMobileAppTitle('/m/unbox'), "getMobileAppTitle('/m/unbox')"],
  ['inbound', term('inbound'), "VOCABULARY 'inbound'"],
  ['outbound', term('outbound'), "VOCABULARY 'outbound'"],
  ['view', literal(SCAN_HEADER, /value: 'view', label: '([^']+)'/), `${SCAN_HEADER} mode option`],
  ['operate', literal(SCAN_HEADER, /value: 'operate', label: '([^']+)'/), `${SCAN_HEADER} mode option`],
  ['scanDirectionLabel', literal(SCAN_HEADER, /ariaLabel="(Scan direction)"/), `${SCAN_HEADER} toggle name`],
  ['scanBehaviorLabel', literal(SCAN_HEADER, /ariaLabel="(Scan behavior)"/), `${SCAN_HEADER} toggle name`],
  ['openApplications', literal('src/components/mobile/v2/MobileV2AppSwitcher.tsx', /: '(Open applications)'/), 'MobileV2AppSwitcher.tsx trigger name'],
  ['goToScan', literal('src/components/mobile/v2/MobileV2ScanCta.tsx', /ariaLabel="([^"]+)"/), 'MobileV2ScanCta.tsx'],
  ['close', literal('src/components/mobile/v2/MobileV2DetailTopBar.tsx', /ariaLabel=\{close \? '([^']+)'/), 'MobileV2DetailTopBar.tsx X'],
  ['pairSubtitle', literal(PLACEMENT, /subtitle="([^"]+)"/), `${PLACEMENT} detail bar`],
  ['packageTitlePrefix', literal(PLACEMENT, /title=\{`([^`$]+) \$\{receivingId\}`\}/), `${PLACEMENT} detail bar title, before the id`],
  ['promptView', literal(SCAN_IDENTIFY, /\? '(View records without changing them)'/), `${SCAN_IDENTIFY} empty tape, View`],
  ['promptOutbound', literal(SCAN_IDENTIFY, /\? '(Scan a shipping label to scan it out)'/), `${SCAN_IDENTIFY} empty tape, Outbound`],
  ['promptInbound', literal(SCAN_IDENTIFY, /: '(Scan a tracking number or location code)'/), `${SCAN_IDENTIFY} empty tape, Inbound`],
  ['statusViewOnly', literal(SCAN_IDENTIFY, /return '(View only)'/), `${SCAN_IDENTIFY} status, View`],
  ['viewNoRecord', literal(SCAN_IDENTIFY, /: '(No saved record found · switch to Operate to intake)'/), `${SCAN_IDENTIFY} View refusal`],
  ['typedLabelDoor', literal(SCAN_IDENTIFY, /\? '(Tracking or last 8 digits)'/), `${SCAN_IDENTIFY} typed field at the Inbound door`],
  ['typedLabel', literal(CAPTURE, /manualLabel = '([^']+)'/), `${CAPTURE} typed field default`],
];

/** Home rows: the native screens in the switcher's order (family › group › destination). */
function homeSections(): Array<{ family: string; group: string | null; rows: Array<{ screen: string; title: string; href: string; door: string }> }> {
  const sections: ReturnType<typeof homeSections> = [];
  const place = (family: string, group: string | null, destinations: readonly MobileV2Destination[]) => {
    const rows = destinations.flatMap((destination) =>
      NATIVE_SCREENS.filter((screen) => screen.door === destination.id).map((screen) => ({
        screen: screen.screen,
        title: getMobileAppTitle(screen.href),
        href: screen.href,
        door: destination.href,
      })),
    );
    if (rows.length > 0) sections.push({ family, group, rows });
  };
  for (const family of MOBILE_V2_NAVIGATION_FAMILIES) {
    if (family.destinations) place(family.label, null, family.destinations);
    for (const group of family.groups ?? []) place(family.label, group.label, group.destinations);
  }
  const placed = sections.flatMap((section) => section.rows.map((row) => row.screen));
  for (const screen of NATIVE_SCREENS) {
    if (!placed.includes(screen.screen)) throw new Error(`${screen.screen}: its door '${screen.door}' is not a mobile destination any more`);
  }
  return sections;
}

const home = homeSections();
const q = (s: string) => JSON.stringify(s);

const swift = `// GENERATED by the web repo's scripts/ios/generate-ios-vocabulary.mts — do not edit.
// Regenerate (web repo root, cycleforge-lanes/prod):
//   node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/ios/generate-ios-vocabulary.mts
// Drift check without writing: append --check.
//
// The words the Home, Scan, Pair and Unbox chrome print, read from the web.

/// One word per job, verbatim from the web.
public enum CFWords {
${words.map(([name, word, source]) => `    /// ${source}\n    public static let ${name} = ${q(word)}`).join('\n')}

    /// Every word above by its Swift name — what \`VocabularyParityTests\` holds to the web.
    public static let all: [String: String] = [
${words.map(([name]) => `        ${q(name)}: ${name},`).join('\n')}
    ]
}

/// A native screen on Home, where the web's application switcher puts its door.
public struct CFHomeRow: Equatable, Sendable {
    /// The app's screen.
    public let screen: String
    /// Its top-bar title on the web.
    public let title: String
    /// The \`/m\` route it ports.
    public let href: String
    /// The web destination whose page links to it.
    public let door: String

    public init(screen: String, title: String, href: String, door: String) {
        self.screen = screen
        self.title = title
        self.href = href
        self.door = door
    }
}

/// Home's sections, in the web switcher's order (MOBILE_V2_NAVIGATION_FAMILIES).
public struct CFHomeSection: Equatable, Sendable {
    public let family: String
    public let group: String?
    public let rows: [CFHomeRow]

    public init(family: String, group: String?, rows: [CFHomeRow]) {
        self.family = family
        self.group = group
        self.rows = rows
    }
}

public enum CFNavigation {
    public static let home: [CFHomeSection] = [
${home
  .map(
    (section) =>
      `        CFHomeSection(family: ${q(section.family)}, group: ${section.group === null ? 'nil' : q(section.group)}, rows: [\n${section.rows
        .map((row) => `            CFHomeRow(screen: ${q(row.screen)}, title: ${q(row.title)}, href: ${q(row.href)}, door: ${q(row.door)}),`)
        .join('\n')}\n        ]),`,
  )
  .join('\n')}
    ]
}
`;

const fixture = {
  source: 'web repo scripts/ios/generate-ios-vocabulary.mts',
  words: Object.fromEntries(words.map(([name, word]) => [name, word])),
  home,
};

deliver(GENERATOR, [
  { path: SWIFT_PATH, content: swift },
  { path: FIXTURE_PATH, content: `${JSON.stringify(fixture, null, 2)}\n` },
]);
