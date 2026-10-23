"use client";

import { useState, type ReactNode } from "react";
import { SocialPreview } from "@/components/content/social-preview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { editorFieldsFrom, parseHashtagField, type EditorSource } from "@/lib/content/editor-fields";
import type { ContentStatus } from "@/lib/types";
import { ContentEditor } from "./content-editor";
import { ContentWorkflow } from "./workflow-actions";
import { PlatformPublishPanel, type PlatformRow } from "./platform-publish-panel";

export function ReviewWorkspace({
  contentId, organisationId, initial, status, scheduledAt, timeZone,
  businessName, mediaUrl, mediaType, mediaError, rows, canPublish, children,
}: {
  contentId: string;
  organisationId: string;
  initial: EditorSource;
  status: ContentStatus;
  scheduledAt: string | null;
  timeZone: string;
  businessName: string;
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  mediaError: string | null;
  rows: PlatformRow[];
  canPublish: boolean;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState(() => ({ fields: editorFieldsFrom(initial), unsaved: false }));
  const fields = preview.fields;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="min-w-0 space-y-6">
        <section className="jacita-panel rounded-2xl p-5 sm:p-6">
          <h2 className="font-heading text-lg font-semibold text-balance">Workflow</h2>
          {preview.unsaved ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">Save your changes before approving, scheduling or publishing.</p>
          ) : null}
          <fieldset disabled={preview.unsaved} className="mt-5 min-w-0 disabled:opacity-60">
            <legend className="sr-only">Content approval and scheduling</legend>
            <ContentWorkflow contentId={contentId} organisationId={organisationId} status={status} scheduledAt={scheduledAt} timeZone={timeZone} />
          </fieldset>
        </section>
        <ContentEditor
          contentId={contentId} organisationId={organisationId} initial={initial}
          status={status} scheduledAt={scheduledAt} timeZone={timeZone}
          onPreviewChange={(next, unsaved) => setPreview({ fields: next, unsaved })}
        />
        <section className="jacita-panel rounded-2xl p-5 sm:p-6">
          <h2 className="font-heading text-lg font-semibold text-balance">Per-platform publishing</h2>
          <fieldset disabled={preview.unsaved} className="mt-5 min-w-0 disabled:opacity-60">
            <legend className="sr-only">Publishing actions</legend>
            <PlatformPublishPanel contentId={contentId} rows={rows} contentStatus={status} canPublish={canPublish} timeZone={timeZone} />
          </fieldset>
        </section>
        {children}
      </div>
      <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start" aria-label="Publication preview">
        <p className="jacita-label mb-3">{preview.unsaved ? "Preview · unsaved changes" : "Publication preview"}</p>
        {rows.length ? (
          <Tabs defaultValue={rows[0].platform}>
            <TabsList aria-label="Preview platform" className="mb-3 h-auto! max-w-full flex-wrap">
              {rows.map((row) => <TabsTrigger key={row.id} value={row.platform} className="min-h-11 capitalize">{row.platform}</TabsTrigger>)}
            </TabsList>
            {rows.map((row) => (
              <TabsContent key={row.id} value={row.platform}>
                <SocialPreview
                  platform={row.platform} businessName={businessName}
                  accountName={row.account_name} accountHandle={row.account_handle}
                  connectionStatus={row.connection_status}
                  caption={fields.caption} hook={fields.hook} callToAction={fields.call_to_action}
                  hashtags={parseHashtagField(fields.hashtags)}
                  mediaUrl={mediaUrl} mediaType={mediaType} mediaError={mediaError}
                  altText={fields.alt_text} onScreenText={fields.on_screen_text}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : <p className="text-sm text-muted-foreground">No platforms selected for this content.</p>}
      </aside>
    </div>
  );
}
