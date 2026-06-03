import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { Lead } from "./lead-types";
import { emptyLead } from "./lead-types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  mode: "create" | "edit";
  onSave: (lead: Lead) => void;
  stages: string[];
}

export function LeadDialog({ open, onOpenChange, lead, mode, onSave, stages }: Props) {
  const [draft, setDraft] = useState<Lead>(lead ?? emptyLead());
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(lead ?? emptyLead());
      setTagInput("");
    }
  }, [open, lead]);

  const set = <K extends keyof Lead>(key: K, value: Lead[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || draft.tags.includes(t)) return;
    set("tags", [...draft.tags, t]);
    setTagInput("");
  };

  const handleSave = () => {
    onSave({ ...draft, updatedAt: new Date().toISOString() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                {mode === "create" ? "New lead" : `Lead · ${draft.stage}`}
              </div>
              <DialogTitle className="text-lg mt-0.5">
                {draft.name || (mode === "create" ? "Untitled lead" : "Lead profile")}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {draft.company || draft.email || "Complete the fields below to capture this lead."}
              </DialogDescription>
            </div>
            <div className="w-44 shrink-0">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Stage</Label>
              <Select value={draft.stage} onValueChange={(v) => set("stage", v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="contact" className="flex-1 overflow-hidden flex flex-col">
          <div className="px-6 pt-3 bg-muted/30 border-b border-border">
            <TabsList className="bg-transparent p-0 h-auto gap-0 w-full justify-start rounded-none">
              {[
                ["contact", "Contact"],
                ["details", "Details"],
                ["tracking", "Tracking"],
                ["urls", "URLs"],
                ["consent", "Consent"],
              ].map(([v, label]) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className="relative rounded-none bg-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:bg-foreground after:scale-x-0 after:transition-transform data-[state=active]:after:scale-x-100 hover:text-foreground transition-colors"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>


          <div className="flex-1 overflow-y-auto px-6 py-5">
            <TabsContent value="contact" className="mt-0 space-y-4">
              <SectionTitle>Contact information</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name"><Input value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field>
                <Field label="Email address"><Input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} /></Field>
                <Field label="Phone number"><Input value={draft.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
                <Field label="Company"><Input value={draft.company ?? ""} onChange={(e) => set("company", e.target.value)} /></Field>
              </div>
              <Field label="Lead description">
                <Textarea rows={4} value={draft.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </TabsContent>

            <TabsContent value="details" className="mt-0 space-y-4">
              <SectionTitle>Lead details</SectionTitle>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Priority">
                  <Select value={draft.priority} onValueChange={(v) => set("priority", v as Lead["priority"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Low", "Medium", "High"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Qualification status">
                  <Select value={draft.qualification} onValueChange={(v) => set("qualification", v as Lead["qualification"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Unqualified", "Qualified", "Customer"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Lead value (€)">
                  <Input type="number" min={0} value={draft.value} onChange={(e) => set("value", Number(e.target.value) || 0)} />
                </Field>
              </div>
              <Field label="Campaign name"><Input value={draft.campaignName} onChange={(e) => set("campaignName", e.target.value)} /></Field>
              <Field label="Tags">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      placeholder="Add a tag and press Enter"
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    />
                    <Button type="button" variant="outline" onClick={addTag}>Add</Button>
                  </div>
                  {draft.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {draft.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="gap-1 font-normal">
                          {t}
                          <button onClick={() => set("tags", draft.tags.filter((x) => x !== t))}>
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Internal notes">
                <Textarea rows={4} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </TabsContent>

            <TabsContent value="tracking" className="mt-0 space-y-5">
              <div>
                <SectionTitle>UTM parameters</SectionTitle>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="UTM source"><Input value={draft.utmSource} onChange={(e) => set("utmSource", e.target.value)} /></Field>
                  <Field label="UTM medium"><Input value={draft.utmMedium} onChange={(e) => set("utmMedium", e.target.value)} /></Field>
                  <Field label="UTM campaign"><Input value={draft.utmCampaign} onChange={(e) => set("utmCampaign", e.target.value)} /></Field>
                </div>
              </div>
              <div>
                <SectionTitle>Platform tracking IDs</SectionTitle>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="Google Click ID (gclid)"><Input value={draft.gclid} onChange={(e) => set("gclid", e.target.value)} /></Field>
                  <Field label="Facebook Click ID (fbclid)"><Input value={draft.fbclid} onChange={(e) => set("fbclid", e.target.value)} /></Field>
                  <Field label="LinkedIn tracking ID"><Input value={draft.liTrackingId} onChange={(e) => set("liTrackingId", e.target.value)} /></Field>
                  <Field label="Microsoft Click ID"><Input value={draft.msclkid} onChange={(e) => set("msclkid", e.target.value)} /></Field>
                  <Field label="Meta Browser ID (fbp)"><Input value={draft.fbp} onChange={(e) => set("fbp", e.target.value)} /></Field>
                  <Field label="GA Client ID"><Input value={draft.gaClientId} onChange={(e) => set("gaClientId", e.target.value)} /></Field>
                  <Field label="GA Session ID"><Input value={draft.gaSessionId} onChange={(e) => set("gaSessionId", e.target.value)} /></Field>
                  <Field label="Currency">
                    <Select value={draft.currency} onValueChange={(v) => set("currency", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["EUR", "USD", "GBP", "CAD", "AUD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
              <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
                This information allows Leadlogr to send accurate conversion data back to Google Ads and Meta Ads for campaign optimization.
              </p>
            </TabsContent>

            <TabsContent value="urls" className="mt-0 space-y-4">
              <SectionTitle>URLs</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Website URL"><Input value={draft.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} /></Field>
                <Field label="Landing page URL"><Input value={draft.landingPageUrl} onChange={(e) => set("landingPageUrl", e.target.value)} /></Field>
                <Field label="Page path"><Input value={draft.pagePath} onChange={(e) => set("pagePath", e.target.value)} /></Field>
                <Field label="Referrer URL"><Input value={draft.referrerUrl} onChange={(e) => set("referrerUrl", e.target.value)} /></Field>
              </div>
            </TabsContent>

            <TabsContent value="consent" className="mt-0 space-y-4">
              <SectionTitle>Consent information</SectionTitle>
              <Field label="Overall consent status">
                <Select value={draft.consent} onValueChange={(v) => set("consent", v as Lead["consent"])}>
                  <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Unknown", "Accepted", "Declined"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
                Ensures compliance with privacy regulations and proper consent tracking for advertising and analytics usage.
              </p>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>{mode === "create" ? "Add lead" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h3>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}
