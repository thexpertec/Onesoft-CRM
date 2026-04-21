import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Address } from "@/lib/store";

type Props = {
  value: Address;
  onChange: (next: Address) => void;
  /** Optional id prefix so multiple instances on the same page don't clash. */
  idPrefix?: string;
};

/**
 * Reusable structured-address editor.
 * Captures: Country, State/Province, City, Area, Postal/ZIP code,
 * and the Complete Address (street + building) as a multi-line field.
 */
export default function AddressFields({ value, onChange, idPrefix = "addr" }: Props) {
  const set = (patch: Partial<Address>) => onChange({ ...value, ...patch });

  const fieldLabel =
    "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1";

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label htmlFor={`${idPrefix}-country`} className={fieldLabel}>Country</label>
        <Input
          id={`${idPrefix}-country`}
          value={value.country ?? ""}
          onChange={e => set({ country: e.target.value })}
          placeholder="e.g. Pakistan"
          className="h-8 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-state`} className={fieldLabel}>State / Province</label>
        <Input
          id={`${idPrefix}-state`}
          value={value.state ?? ""}
          onChange={e => set({ state: e.target.value })}
          placeholder="e.g. Punjab"
          className="h-8 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-city`} className={fieldLabel}>City</label>
        <Input
          id={`${idPrefix}-city`}
          value={value.city ?? ""}
          onChange={e => set({ city: e.target.value })}
          placeholder="e.g. Lahore"
          className="h-8 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-area`} className={fieldLabel}>Area / Region</label>
        <Input
          id={`${idPrefix}-area`}
          value={value.area ?? ""}
          onChange={e => set({ area: e.target.value })}
          placeholder="e.g. DHA Phase 5"
          className="h-8 text-sm"
        />
      </div>
      <div className="col-span-2">
        <label htmlFor={`${idPrefix}-line`} className={fieldLabel}>Complete Address</label>
        <Textarea
          id={`${idPrefix}-line`}
          value={value.line ?? ""}
          onChange={e => set({ line: e.target.value })}
          placeholder="Building / street / landmark"
          rows={2}
          className="text-sm"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-postal`} className={fieldLabel}>Postal / ZIP Code</label>
        <Input
          id={`${idPrefix}-postal`}
          value={value.postalCode ?? ""}
          onChange={e => set({ postalCode: e.target.value })}
          placeholder="e.g. 54000"
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}

/** Shared empty-address constant — handy for resetting form state. */
export const EMPTY_ADDRESS: Address = {
  country: "", state: "", city: "", area: "", line: "", postalCode: "",
};
