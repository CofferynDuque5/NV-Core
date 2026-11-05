import * as React from "react";
import type { Segment } from "@nv/domain";
import { Loader2 } from "lucide-react";

import { useTagSegment } from "@/hooks/use-domain-mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const split = (v: string) =>
  v
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/** «Etiquetar a todos»: add/remove tags on every contact now in the segment. */
export function SegmentTagDialog({ segment, onClose }: { segment: Segment | null; onClose: () => void }) {
  const tag = useTagSegment();
  const [add, setAdd] = React.useState("");
  const [remove, setRemove] = React.useState("");
  React.useEffect(() => {
    if (segment) {
      setAdd("");
      setRemove("");
    }
  }, [segment]);
  const nothing = split(add).length === 0 && split(remove).length === 0;

  return (
    <Dialog open={!!segment} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Etiquetar a todo el segmento</DialogTitle>
          <DialogDescription>
            Se aplica a los {segment?.count ?? 0} contactos que hoy están en «{segment?.name}». Los que entren después no
            reciben la etiqueta.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!segment || nothing) return;
            tag.mutate({ id: segment.id, add: split(add), remove: split(remove) }, { onSuccess: onClose });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="seg-tag-add">Poner etiquetas (separadas por coma)</Label>
            <Input id="seg-tag-add" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="cumple-noviembre, vip" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seg-tag-remove">Quitar etiquetas (opcional)</Label>
            <Input id="seg-tag-remove" value={remove} onChange={(e) => setRemove(e.target.value)} placeholder="frío" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={nothing || tag.isPending} data-testid="segment-tag-confirm">
              {tag.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Aplicar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
