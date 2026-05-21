import { useState, useEffect, useMemo } from "react";
import { Combobox, ComboOption } from "@/components/combobox";

interface SelectComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  maxResults?: number;
  minDropdownWidth?: number;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
}

export function SelectCombobox({
  value, onChange, options, placeholder,
  className, inputClassName, maxResults = 50, minDropdownWidth,
  disabled, id, "data-testid": testId,
}: SelectComboboxProps) {
  const labelByValue = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.value, o.label);
    return m;
  }, [options]);

  const committedLabel = labelByValue.get(value) ?? "";
  const [text, setText] = useState(committedLabel);

  useEffect(() => { setText(committedLabel); }, [committedLabel]);

  return (
    <Combobox
      id={id}
      data-testid={testId}
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      className={className}
      inputClassName={inputClassName}
      maxResults={maxResults}
      minDropdownWidth={minDropdownWidth}
      options={options}
      onChange={setText}
      onSelect={opt => { setText(opt.label); onChange(opt.value); }}
      onBlur={() => { setText(committedLabel); }}
    />
  );
}
