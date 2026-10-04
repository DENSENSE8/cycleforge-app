import SwiftUI

/// Native counterpart of `src/lib/mobile/v2-scan-recent.ts`.
/// Keep coding keys and newest-first ordering identical to the web contract.
struct MobileV2ScanRecent: Identifiable, Codable, Equatable, Sendable {
    enum Tone: String, Codable, Sendable { case ok, warn, bad }

    let id: String
    let title: String
    let identifier: String?
    let outcome: String
    let tone: Tone
    let imageUrl: URL?
    let occurredAt: Date
    let isLive: Bool
    let isLatest: Bool
}

/// V2 list semantics: newest first, one compact row, details on tap.
struct MobileV2ScanRecentList: View {
    let rows: [MobileV2ScanRecent]
    let open: (MobileV2ScanRecent) -> Void

    var body: some View {
        List {
            Section("Recent") {
                ForEach(rows) { row in
                    Button { open(row) } label: {
                        MobileV2ScanRecentRow(row: row)
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: DesignTokens.Mode.triage.hitMinTouch)
                }
            }
        }
        .listStyle(.plain)
    }
}

private struct MobileV2ScanRecentRow: View {
    let row: MobileV2ScanRecent

    private var tone: DesignTokens.Tone {
        switch row.tone {
        case .ok: DesignTokens.State.success
        case .warn: DesignTokens.State.warning
        case .bad: DesignTokens.State.danger
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2)
                .fill(tone.fill)
                .frame(width: 3)

            AsyncImage(url: row.imageUrl) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                DesignTokens.Mode.triage.well
            }
            .frame(width: 48, height: 48)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(row.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                HStack(spacing: 8) {
                    if let identifier = row.identifier {
                        Text(identifier).font(.caption.monospaced()).lineLimit(1)
                    }
                    Text(row.occurredAt, style: .relative).font(.caption)
                }
                .foregroundStyle(DesignTokens.Mode.triage.muted)
            }

            Spacer(minLength: 4)
            Text(row.outcome)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tone.text)
                .lineLimit(1)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(DesignTokens.Mode.triage.faint)
        }
        .contentShape(Rectangle())
    }
}
