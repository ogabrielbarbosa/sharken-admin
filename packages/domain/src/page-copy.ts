export type PageCopy = {
  headline: string;
  subheadline: string;
  about: string | null;
  services: { name: string; description: string | null }[];
  cta: string;
};
