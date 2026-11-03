// Browser validation otherwise follows the device language, not <html lang>.
// Keep native focus/accessible feedback, with English messages for our forms.
export function installEnglishValidation() {
  const isField = (
    target: EventTarget | null,
  ): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
  document.addEventListener(
    "invalid",
    (event) => {
      const field = event.target;
      if (!isField(field)) return;
      const v = field.validity;
      let message = "Please check this value.";
      if (v.valueMissing)
        message =
          field instanceof HTMLSelectElement
            ? "Please choose an option."
            : "Please fill out this field.";
      else if (v.typeMismatch)
        message =
          field instanceof HTMLInputElement && field.type === "email"
            ? "Please enter a valid email address."
            : "Please enter a valid value.";
      else if (v.tooShort)
        message = `Please enter at least ${(field as HTMLInputElement).minLength} characters.`;
      else if (v.tooLong)
        message = `Please use no more than ${(field as HTMLInputElement).maxLength} characters.`;
      else if (v.rangeUnderflow)
        message = `Please enter ${(field as HTMLInputElement).min} or more.`;
      else if (v.rangeOverflow)
        message = `Please enter ${(field as HTMLInputElement).max} or less.`;
      else if (v.stepMismatch || v.badInput)
        message = "Please enter a valid number.";
      else if (v.patternMismatch)
        message = "Please match the requested format.";
      field.setCustomValidity(message);
    },
    true,
  );
  const reset = (event: Event) => {
    if (isField(event.target)) event.target.setCustomValidity("");
  };
  document.addEventListener("input", reset);
  document.addEventListener("change", reset);
}
