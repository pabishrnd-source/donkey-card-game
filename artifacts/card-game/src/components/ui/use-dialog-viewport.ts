import { useLayoutEffect, useState, type CSSProperties } from "react";

// Android's keyboard can resize the visual viewport without resizing the page.
export function useDialogViewport(): CSSProperties {
  const read = () => {
    const viewport = window.visualViewport;
    return {
      "--dialog-height": `${viewport?.height ?? window.innerHeight}px`,
      "--dialog-width": `${viewport?.width ?? window.innerWidth}px`,
      "--dialog-top": `${viewport?.offsetTop ?? 0}px`,
      "--dialog-left": `${viewport?.offsetLeft ?? 0}px`,
    } as CSSProperties;
  };
  const [style, setStyle] = useState(read);
  useLayoutEffect(() => {
    const update = () => setStyle(read());
    const viewport = window.visualViewport;
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return style;
}
