import { PATCH_NOTES } from "./releases";

/** The release history, newest first (join screen, "What's new"). Each release collapses to its header (click to toggle); the current one starts open. */
export function PatchNotes({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div className="submenu-header">
        <button type="button" className="link" onClick={onBack}>
          ← Back
        </button>
        <span className="panel-title">What's new</span>
      </div>

      {PATCH_NOTES.map((note, i) => (
        // The current release starts expanded, older ones collapsed.
        <details key={note.version} className="patch-note" open={i === 0}>
          <summary>
            <div className="patch-note-header">
              <span className="patch-version">v{note.version}</span>
              {i === 0 && <span className="patch-current">Current</span>}
              <span className="muted small patch-date">{note.date}</span>
            </div>
            <span className="patch-title">{note.title}</span>
          </summary>
          <ul className="patch-changes">
            {note.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      ))}

      <button type="button" className="primary" onClick={onBack}>
        Back
      </button>
    </>
  );
}
