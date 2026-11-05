import React, { useMemo, useState } from 'react';
import type { MediaItem, TimelineClip } from '../types';
import { buildDisclosureReport, buildUseLedgerCsv, disclosureStatement, formatTimecode, type DisclosureAsset } from '../utils/aiDisclosure';

interface AiDisclosurePanelProps {
  mediaItems: MediaItem[];
  timelineClips: TimelineClip[];
  /** Records the person's own call about a file. null goes back to what the app can tell. */
  onSetOrigin?: (mediaId: string, origin: 'ai' | 'not-ai' | null) => void;
  fileBaseName?: string;
}

const originText = (asset: DisclosureAsset): string => {
  const { kind, basis } = asset.origin;
  if (kind === 'ai') return basis === 'marked-by-you' ? 'AI-made (your mark)' : 'AI-generated here';
  if (kind === 'not-ai') return basis === 'stock' ? 'Stock' : basis === 'marked-by-you' ? 'Not AI (your mark)' : 'Processed only';
  return 'Imported';
};

/**
 * Says what in the video was made with AI, gives a line to paste into the caption or description, and downloads a
 * record of every file on the timeline. The app can only tell about media it generated; for anything imported the
 * person says, so the panel never claims a file is human-made when it cannot know.
 */
const AiDisclosurePanel: React.FC<AiDisclosurePanelProps> = ({ mediaItems, timelineClips, onSetOrigin, fileBaseName = 'timeline' }) => {
  const report = useMemo(() => buildDisclosureReport(mediaItems, timelineClips), [mediaItems, timelineClips]);
  const [style, setStyle] = useState<'short' | 'detailed'>('short');
  const [copied, setCopied] = useState(false);
  const statement = disclosureStatement(report, style);
  const byId = useMemo(() => new Map(mediaItems.map((item) => [item.id, item])), [mediaItems]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(statement);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* The text is selectable, so it can still be copied by hand. */
    }
  };

  const downloadLedger = () => {
    const blob = new Blob(['﻿', buildUseLedgerCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileBaseName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'timeline'} - media use.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const percent = Math.round(report.aiShare * 100);

  return (
    <section className="app-panel p-6 text-left" aria-label="AI disclosure" data-testid="ai-disclosure">
      <h2 className="text-xl font-bold mb-1">AI disclosure</h2>
      {report.assets.length === 0 ? (
        <p className="text-sm app-muted">Add clips to the timeline and this shows which of them were made with AI.</p>
      ) : (
        <>
          <p className="text-sm mb-1" data-testid="ai-summary">
            {report.ai.length === 0
              ? 'Nothing on the timeline was generated in this app.'
              : `${report.ai.length} of ${report.assets.length} file${report.assets.length === 1 ? '' : 's'} on the timeline ${report.ai.length === 1 ? 'is' : 'are'} AI-made, on screen or in the mix for about ${percent}% of the running time.`}
          </p>
          {report.unchecked.length > 0 && (
            <p className="text-sm app-muted mb-3" data-testid="ai-unchecked">
              {report.unchecked.length} imported file{report.unchecked.length === 1 ? '' : 's'} could not be checked. The app only knows about media it generated, so mark any that you made with AI elsewhere.
            </p>
          )}

          <ul className="grid gap-2 mb-4" aria-label="Files on the timeline">
            {report.assets.map((asset) => {
              const item = byId.get(asset.id);
              const marked = item?.aiOrigin ?? '';
              return (
                <li key={asset.id} className="app-card p-3 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid={`ai-asset-${asset.id}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold truncate">{asset.name}</span>
                    <span className="block text-xs app-muted truncate">
                      {asset.model ? `${asset.model} · ` : ''}
                      {asset.uses.map((u) => `${formatTimecode(u.start)}-${formatTimecode(u.end)}`).join(', ')}
                    </span>
                  </span>
                  <span className="text-xs font-semibold" data-testid={`ai-origin-${asset.id}`}>{originText(asset)}</span>
                  {onSetOrigin && (
                    <select
                      className="app-select text-xs"
                      style={{ width: '11rem' }}
                      aria-label={`Origin of ${asset.name}`}
                      value={marked}
                      onChange={(e) => onSetOrigin(asset.id, e.target.value === 'ai' ? 'ai' : e.target.value === 'not-ai' ? 'not-ai' : null)}
                    >
                      <option value="">{item?.source === 'generated' ? 'Generated here' : item?.source === 'unsplash' ? 'Stock' : 'Not marked'}</option>
                      <option value="ai">Made with AI</option>
                      <option value="not-ai">Not AI</option>
                    </select>
                  )}
                </li>
              );
            })}
          </ul>

          {statement && (
            <div className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <span className="text-sm font-bold">Line for your caption or description</span>
                <span className="flex gap-1" role="group" aria-label="Wording">
                  <button type="button" className={`app-button text-xs ${style === 'short' ? 'app-primary' : ''}`} onClick={() => setStyle('short')}>Short</button>
                  <button type="button" className={`app-button text-xs ${style === 'detailed' ? 'app-primary' : ''}`} onClick={() => setStyle('detailed')}>With tools</button>
                </span>
              </div>
              <p className="app-card p-3 text-sm select-text" data-testid="ai-statement">{statement}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="app-button app-primary text-sm" onClick={copy} disabled={!statement}>{copied ? 'Copied' : 'Copy the line'}</button>
            <button type="button" className="app-button text-sm" onClick={downloadLedger}>Download media use list (CSV)</button>
          </div>
          <p className="text-xs app-muted mt-3">
            Most platforms ask you to label realistic AI-made or altered video when you upload it, and each has its own setting for that. Their rules differ and change, so check the one you post on. This is a record to help you, not legal advice.
          </p>
        </>
      )}
    </section>
  );
};

export default AiDisclosurePanel;
