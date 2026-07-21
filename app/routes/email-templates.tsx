import { env } from "cloudflare:workers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  Plus,
  Send,
  Trash2,
} from "lucide-react";

import type { Route } from "./+types/email-templates";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { requireAdmin } from "~/lib/auth.server";
import { sendEmail } from "~/lib/gmail.server";
import {
  BLOCK_LABELS,
  type BlockType,
  DEFAULT_TEMPLATES,
  type EmailBlock,
  type EmailBranding,
  MERGE_TAGS,
  newBlock,
  sampleContext,
  type TemplateContent,
  type TemplateKey,
  TEMPLATE_KEYS,
  TEMPLATE_META,
} from "~/lib/email-templates";
import {
  getAllTemplates,
  getBranding,
  isTemplateKey,
  renderContent,
  saveTemplate,
  updateBranding,
} from "~/lib/email-templates.server";
import { getGoogleTokens } from "~/lib/google-tokens.server";
import { formatDueDate, getInvoiceSettings } from "~/lib/invoices.server";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Email templates · Mellow" }];
}

const BLOCK_TYPES: BlockType[] = [
  "hero",
  "heading",
  "paragraph",
  "list",
  "button",
  "summary",
  "bank",
  "divider",
  "spacer",
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [templates, branding, google] = await Promise.all([
    getAllTemplates(env.DB),
    getBranding(env.DB),
    getGoogleTokens(env.DB),
  ]);
  return {
    templates,
    branding,
    gmail: { connected: google !== null, email: google?.email ?? null },
  };
}

function parseContent(form: FormData): TemplateContent {
  const blocks = JSON.parse(String(form.get("blocks") ?? "[]")) as unknown;
  if (!Array.isArray(blocks)) throw new Error("Blocks must be an array.");
  return {
    subject: String(form.get("subject") ?? ""),
    preheader: String(form.get("preheader") ?? ""),
    blocks: blocks as EmailBlock[],
  };
}

function brandingFromForm(form: FormData): EmailBranding {
  const s = (k: string) => String(form.get(k) ?? "").trim();
  return {
    fromName: s("fromName"),
    logoUrl: s("logoUrl"),
    brandColor: s("brandColor"),
    accentColor: s("accentColor"),
    buttonColor: s("buttonColor"),
    headerBg: s("headerBg"),
    footerBg: s("footerBg"),
    footerLogoUrl: s("footerLogoUrl"),
    footerText: String(form.get("footerText") ?? ""),
    contactEmail: s("contactEmail"),
    websiteUrl: s("websiteUrl"),
    instagramUrl: s("instagramUrl"),
    facebookUrl: s("facebookUrl"),
    tiktokUrl: s("tiktokUrl"),
  };
}

/**
 * Merge context for previews / test sends. Starts from the sample values, then
 * — for the approval email — overlays the real saved invoice settings (bank
 * details, confirmation form, payment due date) so the preview faithfully shows
 * what recipients actually receive rather than placeholders.
 */
async function previewContext(
  key: TemplateKey,
): Promise<Record<string, string>> {
  const ctx = sampleContext(key);
  if (key === "approval") {
    const s = await getInvoiceSettings(env.DB);
    ctx.bankAccountName = s.bankAccountName ?? "";
    ctx.bankBsb = s.bankBsb ?? "";
    ctx.bankAccountNumber = s.bankAccountNumber ?? "";
    ctx.confirmationFormUrl = s.confirmationFormUrl ?? "";
    ctx.dueDate = formatDueDate(s.dueDays);
  }
  return ctx;
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "preview") {
      const key = String(form.get("key") ?? "");
      if (!isTemplateKey(key)) return { ok: false, message: "Unknown template." };
      const content = parseContent(form);
      const brandingJson = form.get("branding");
      const branding = brandingJson
        ? (JSON.parse(String(brandingJson)) as EmailBranding)
        : await getBranding(env.DB);
      const rendered = renderContent(content, branding, await previewContext(key));
      return {
        ok: true,
        intent: "preview" as const,
        previewHtml: rendered.html,
        previewSubject: rendered.subject,
      };
    }

    if (intent === "save_template") {
      const key = String(form.get("key") ?? "");
      if (!isTemplateKey(key)) return { ok: false, message: "Unknown template." };
      const content = parseContent(form);
      if (!content.subject.trim())
        return { ok: false, message: "Subject can't be empty." };
      await saveTemplate(env.DB, key, content, session.email);
      return { ok: true, message: `Saved “${TEMPLATE_META[key].label}”.` };
    }

    if (intent === "save_branding") {
      await updateBranding(env.DB, brandingFromForm(form));
      return { ok: true, message: "Branding saved." };
    }

    if (intent === "send_test") {
      const key = String(form.get("key") ?? "");
      if (!isTemplateKey(key)) return { ok: false, message: "Unknown template." };
      const content = parseContent(form);
      const branding = await getBranding(env.DB);
      const rendered = renderContent(content, branding, await previewContext(key));
      await sendEmail(env, {
        to: session.email,
        subject: `[TEST] ${rendered.subject}`,
        html: rendered.html,
        fromName: branding.fromName,
      });
      return { ok: true, message: `Test sent to ${session.email}.` };
    }

    return { ok: false, message: "Unknown action." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Something went wrong.",
    };
  }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export default function EmailTemplates({ loaderData }: Route.ComponentProps) {
  const { templates, branding: initialBranding, gmail } = loaderData;
  const [selected, setSelected] = useState<TemplateKey | "branding">(
    TEMPLATE_KEYS[0],
  );
  const [drafts, setDrafts] = useState<Record<TemplateKey, TemplateContent>>(
    () => structuredClone(templates),
  );
  const [branding, setBranding] = useState<EmailBranding>(initialBranding);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email templates</h1>
        <p className="text-sm text-muted-foreground">
          Customize the transactional emails sent to applicants. Edits take
          effect on the next send.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TEMPLATE_KEYS.map((k) => (
          <Button
            key={k}
            variant={selected === k ? "default" : "outline"}
            size="sm"
            onClick={() => setSelected(k)}
          >
            {TEMPLATE_META[k].label}
          </Button>
        ))}
        <Button
          variant={selected === "branding" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelected("branding")}
        >
          Branding
        </Button>
      </div>

      {selected === "branding" ? (
        <BrandingEditor branding={branding} onChange={setBranding} />
      ) : (
        <TemplateEditor
          key={selected}
          templateKey={selected}
          content={drafts[selected]}
          branding={branding}
          gmail={gmail}
          onChange={(next) =>
            setDrafts((d) => ({ ...d, [selected]: next }))
          }
        />
      )}
    </div>
  );
}

type ActionData = {
  ok: boolean;
  message?: string;
  intent?: "preview";
  previewHtml?: string;
  previewSubject?: string;
};

function TemplateEditor({
  templateKey,
  content,
  branding,
  gmail,
  onChange,
}: {
  templateKey: TemplateKey;
  content: TemplateContent;
  branding: EmailBranding;
  gmail: { connected: boolean; email: string | null };
  onChange: (next: TemplateContent) => void;
}) {
  const meta = TEMPLATE_META[templateKey];
  const tags = MERGE_TAGS[templateKey];
  const previewFetcher = useFetcher<ActionData>();
  const saveFetcher = useFetcher<ActionData>();
  const testFetcher = useFetcher<ActionData>();

  const contentRef = useRef(content);
  contentRef.current = content;

  // Debounced live preview whenever the working copy changes.
  const refreshPreview = useCallback(() => {
    previewFetcher.submit(
      {
        intent: "preview",
        key: templateKey,
        subject: content.subject,
        preheader: content.preheader,
        blocks: JSON.stringify(content.blocks),
        branding: JSON.stringify(branding),
      },
      { method: "post" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, content, branding]);

  useEffect(() => {
    const t = setTimeout(refreshPreview, 500);
    return () => clearTimeout(t);
  }, [refreshPreview]);

  useEffect(() => {
    const d = saveFetcher.data;
    if (d && saveFetcher.state === "idle")
      d.ok ? toast.success(d.message) : toast.error(d.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveFetcher.data, saveFetcher.state]);

  useEffect(() => {
    const d = testFetcher.data;
    if (d && testFetcher.state === "idle")
      d.ok ? toast.success(d.message) : toast.error(d.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testFetcher.data, testFetcher.state]);

  const update = (patch: Partial<TemplateContent>) =>
    onChange({ ...content, ...patch });

  const setBlocks = (blocks: EmailBlock[]) => update({ blocks });

  const updateBlock = (id: string, patch: Record<string, unknown>) =>
    setBlocks(
      content.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)),
    );

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const next = [...content.blocks];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setBlocks(next);
  };

  const removeBlock = (id: string) =>
    setBlocks(content.blocks.filter((b) => b.id !== id));

  const addBlock = (type: BlockType) =>
    setBlocks([...content.blocks, newBlock(type)]);

  const submitPayload = (intent: string) => ({
    intent,
    key: templateKey,
    subject: content.subject,
    preheader: content.preheader,
    blocks: JSON.stringify(content.blocks),
  });

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(`{{${tag}}}`);
    toast.success(`Copied {{${tag}}}`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Editor column */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {meta.label}
              <Badge variant="secondary" className="font-normal">
                {meta.trigger}
              </Badge>
            </CardTitle>
            <CardDescription>{meta.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={content.subject}
                onChange={(e) => update({ subject: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="preheader">
                Preheader{" "}
                <span className="text-muted-foreground">(inbox preview text)</span>
              </Label>
              <Input
                id="preheader"
                value={content.preheader}
                onChange={(e) => update({ preheader: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Merge tags (click to copy)</Label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => copyTag(t.tag)}
                    title={t.label}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs hover:bg-muted"
                  >
                    <Copy className="size-3" />
                    {`{{${t.tag}}}`}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          {content.blocks.map((block, idx) => (
            <BlockCard
              key={block.id}
              block={block}
              first={idx === 0}
              last={idx === content.blocks.length - 1}
              onMove={(dir) => moveBlock(idx, dir)}
              onRemove={() => removeBlock(block.id)}
              onChange={(patch) => updateBlock(block.id, patch)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-[200px] justify-start">
                <Plus className="size-4" /> Add block
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px]">
              {BLOCK_TYPES.map((t) => (
                <DropdownMenuItem key={t} onSelect={() => addBlock(t)}>
                  {BLOCK_LABELS[t]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(structuredClone(DEFAULT_TEMPLATES[templateKey]));
              toast.message("Reset to default (not yet saved).");
            }}
          >
            Reset to default
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button
            onClick={() =>
              saveFetcher.submit(submitPayload("save_template"), { method: "post" })
            }
            disabled={saveFetcher.state !== "idle"}
          >
            {saveFetcher.state !== "idle" ? "Saving…" : "Save template"}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              testFetcher.submit(submitPayload("send_test"), { method: "post" })
            }
            disabled={!gmail.connected || testFetcher.state !== "idle"}
            title={
              gmail.connected
                ? `Send a sample to ${gmail.email}`
                : "Connect Gmail in Invoice settings to send tests"
            }
          >
            <Send className="size-4" />
            {testFetcher.state !== "idle" ? "Sending…" : "Send test to me"}
          </Button>
          {!gmail.connected && (
            <span className="text-xs text-muted-foreground">
              Gmail not connected — test send disabled.
            </span>
          )}
        </div>
      </div>

      {/* Preview column */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Eye className="size-4" /> Live preview
          </Label>
          <span className="truncate text-xs text-muted-foreground">
            {previewFetcher.data?.previewSubject ?? " "}
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted/30">
          <iframe
            title="Email preview"
            sandbox=""
            className="h-[70vh] w-full bg-white"
            srcDoc={previewFetcher.data?.previewHtml ?? ""}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Rendered with sample data. Blocks hidden when their variable is empty
          (e.g. the pay button) still show here because samples are filled in.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block editors
// ---------------------------------------------------------------------------

function BlockCard({
  block,
  first,
  last,
  onMove,
  onRemove,
  onChange,
}: {
  block: EmailBlock;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3">
        <Badge variant="outline">{BLOCK_LABELS[block.type]}</Badge>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={first}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={last}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pb-4">
        <BlockFields block={block} onChange={onChange} />
        {block.type !== "spacer" && block.type !== "divider" && (
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Hide this block if this variable is empty (optional)
            </Label>
            <Input
              className="font-mono text-xs"
              placeholder="e.g. {{invoiceUrl}}"
              value={block.hideIfEmpty ?? ""}
              onChange={(e) =>
                onChange({ hideIfEmpty: e.target.value || undefined })
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: EmailBlock;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  switch (block.type) {
    case "hero":
      return (
        <>
          <Field label="Tag / badge">
            <Input
              value={block.tag ?? ""}
              onChange={(e) => onChange({ tag: e.target.value })}
            />
          </Field>
          <Field label="Heading">
            <Input
              value={block.heading}
              onChange={(e) => onChange({ heading: e.target.value })}
            />
          </Field>
          <Field label="Subtext">
            <Textarea
              value={block.subtext ?? ""}
              onChange={(e) => onChange({ subtext: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.showReference ?? false}
              onChange={(e) => onChange({ showReference: e.target.checked })}
            />
            Show submission reference chip
          </label>
        </>
      );
    case "heading":
      return (
        <Field label="Text">
          <Input
            value={block.text}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </Field>
      );
    case "paragraph":
      return (
        <Field label="Text (**bold**, [link](url), new lines)">
          <Textarea
            className="min-h-24"
            value={block.text}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </Field>
      );
    case "list":
      return (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.ordered}
              onChange={(e) => onChange({ ordered: e.target.checked })}
            />
            Numbered list
          </label>
          <Field label="Items (one per line)">
            <Textarea
              className="min-h-24"
              value={block.items.join("\n")}
              onChange={(e) =>
                onChange({ items: e.target.value.split("\n") })
              }
            />
          </Field>
        </>
      );
    case "button":
      return (
        <>
          <Field label="Label">
            <Input
              value={block.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </Field>
          <Field label="URL">
            <Input
              value={block.url}
              onChange={(e) => onChange({ url: e.target.value })}
            />
          </Field>
          <Field label="Style">
            <Select
              value={block.variant}
              onValueChange={(v) => onChange({ variant: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="outline">Outline</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      );
    case "summary":
      return (
        <>
          <Field label="Section label">
            <Input
              value={block.label ?? ""}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </Field>
          <Field label="Rows (Label | Value per line; omit label for full-width)">
            <Textarea
              className="min-h-24 font-mono text-xs"
              value={block.rows
                .map((r) => (r.label ? `${r.label} | ${r.value}` : r.value))
                .join("\n")}
              onChange={(e) =>
                onChange({
                  rows: e.target.value.split("\n").map((line) => {
                    const i = line.indexOf("|");
                    return i === -1
                      ? { label: "", value: line.trim() }
                      : {
                          label: line.slice(0, i).trim(),
                          value: line.slice(i + 1).trim(),
                        };
                  }),
                })
              }
            />
          </Field>
        </>
      );
    case "bank":
      return (
        <p className="text-xs text-muted-foreground">
          Renders the EFT bank-transfer details from Invoice settings (account,
          BSB, amount, reference). Nothing to edit here — use “hide if empty” to
          drop it when no BSB is configured.
        </p>
      );
    case "spacer":
      return (
        <Field label="Size">
          <Select
            value={block.size}
            onValueChange={(v) => onChange({ size: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      );
    case "divider":
      return (
        <p className="text-xs text-muted-foreground">A horizontal divider line.</p>
      );
  }
}

// ---------------------------------------------------------------------------
// Branding editor
// ---------------------------------------------------------------------------

function BrandingEditor({
  branding,
  onChange,
}: {
  branding: EmailBranding;
  onChange: (b: EmailBranding) => void;
}) {
  const saveFetcher = useFetcher<ActionData>();
  useEffect(() => {
    const d = saveFetcher.data;
    if (d && saveFetcher.state === "idle")
      d.ok ? toast.success(d.message) : toast.error(d.message);
  }, [saveFetcher.data, saveFetcher.state]);

  const set = (patch: Partial<EmailBranding>) => onChange({ ...branding, ...patch });
  const colorField = (
    key: keyof EmailBranding,
    label: string,
  ) => (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={String(branding[key])}
          onChange={(e) => set({ [key]: e.target.value } as Partial<EmailBranding>)}
          className="size-9 shrink-0 rounded border"
        />
        <Input
          value={String(branding[key])}
          onChange={(e) => set({ [key]: e.target.value } as Partial<EmailBranding>)}
          className="font-mono"
        />
      </div>
    </Field>
  );

  // A logo URL input with a live thumbnail rendered on the background it will
  // actually sit on, so a pasted URL is reflected immediately.
  const logoField = (
    key: "logoUrl" | "footerLogoUrl",
    label: string,
    bg: string,
    placeholder?: string,
  ) => {
    const url = branding[key];
    return (
      <Field label={label}>
        <div className="flex items-center gap-3">
          <div
            className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded border"
            style={{ background: bg }}
          >
            {url ? (
              <img
                src={url}
                alt=""
                className="max-h-10 max-w-12 object-contain"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
                onLoad={(e) => {
                  e.currentTarget.style.visibility = "visible";
                }}
              />
            ) : (
              <span className="text-muted-foreground text-[10px]">No logo</span>
            )}
          </div>
          <Input
            value={url}
            onChange={(e) => set({ [key]: e.target.value })}
            placeholder={placeholder}
          />
        </div>
      </Field>
    );
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>
          Shared header, colors, and footer applied to every template.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From name">
            <Input
              value={branding.fromName}
              onChange={(e) => set({ fromName: e.target.value })}
            />
          </Field>
          <Field label="Contact email">
            <Input
              value={branding.contactEmail}
              onChange={(e) => set({ contactEmail: e.target.value })}
            />
          </Field>
        </div>
        {logoField("logoUrl", "Logo URL", branding.headerBg)}
        <div className="grid gap-4 sm:grid-cols-2">
          {colorField("brandColor", "Brand / hero background")}
          {colorField("accentColor", "Accent (pill)")}
          {colorField("buttonColor", "Button")}
          {colorField("headerBg", "Header background")}
        </div>
        <Field label="Website URL">
          <Input
            value={branding.websiteUrl}
            onChange={(e) => set({ websiteUrl: e.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Instagram URL">
            <Input
              value={branding.instagramUrl}
              onChange={(e) => set({ instagramUrl: e.target.value })}
            />
          </Field>
          <Field label="Facebook URL">
            <Input
              value={branding.facebookUrl}
              onChange={(e) => set({ facebookUrl: e.target.value })}
            />
          </Field>
          <Field label="TikTok URL">
            <Input
              value={branding.tiktokUrl}
              onChange={(e) => set({ tiktokUrl: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {logoField(
            "footerLogoUrl",
            "Footer logo URL",
            branding.footerBg || branding.brandColor,
            "Light/inverted logo for the dark footer",
          )}
          {colorField("footerBg", "Footer background")}
        </div>
        <Field label="Footer text">
          <Textarea
            value={branding.footerText}
            onChange={(e) => set({ footerText: e.target.value })}
          />
        </Field>
        <div className="flex justify-end border-t pt-4">
          <Button
            onClick={() =>
              saveFetcher.submit(
                { intent: "save_branding", ...brandingToForm(branding) },
                { method: "post" },
              )
            }
            disabled={saveFetcher.state !== "idle"}
          >
            {saveFetcher.state !== "idle" ? "Saving…" : "Save branding"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function brandingToForm(b: EmailBranding): Record<string, string> {
  return {
    fromName: b.fromName,
    logoUrl: b.logoUrl,
    brandColor: b.brandColor,
    accentColor: b.accentColor,
    buttonColor: b.buttonColor,
    headerBg: b.headerBg,
    footerBg: b.footerBg,
    footerLogoUrl: b.footerLogoUrl,
    footerText: b.footerText,
    contactEmail: b.contactEmail,
    websiteUrl: b.websiteUrl,
    instagramUrl: b.instagramUrl,
    facebookUrl: b.facebookUrl,
    tiktokUrl: b.tiktokUrl,
  };
}
