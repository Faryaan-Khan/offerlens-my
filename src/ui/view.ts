export interface View {
  title: string;
  heading?: string;
  pretitle?: string;
  icon: string;
  nav: boolean;
  /** Render into `host`; may add buttons to `actions`. Return an optional cleanup function. */
  render(host: HTMLElement, actions: HTMLElement): void | (() => void);
}
