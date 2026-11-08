"use client";
import { phoneMask } from "@/lib/phone-mask";
import { useState } from "react";

export function PhoneInput({
  name,
  defaultValue = "",
  readOnly = false,
  required = false,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <input
        type="tel"
        readOnly={readOnly}
        required={required}
        value={phoneMask(value)}
        onChange={(event) => setValue(event.target.value.replace(/[^\d+]/g, ""))}
        placeholder={placeholder}
      />
    </>
  );
}
