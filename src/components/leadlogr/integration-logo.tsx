import {
  siGoogletagmanager,
  siGoogleads,
  siGoogleanalytics,
  siGooglebigquery,
  siWordpress,
  siZapier,
  siMeta,
  siTiktok,
  siReddit,
  siX,
  siSnapchat,
  siZoho,
  siOdoo,
  siClickup,
} from "simple-icons";

import {
  Linkedin,
  Monitor,
  Server,
  Webhook,
  Target,
  LayoutGrid,
  Users,
  UserPlus,
} from "lucide-react";

function SimpleIcon({ icon }: { icon: { path: string; hex: string } }) {
  const fill = icon.hex === "000000" ? "currentColor" : `#${icon.hex}`;
  return (
    <svg viewBox="0 0 24 24" className="size-5" style={{ fill }}>
      <path d={icon.path} />
    </svg>
  );
}

export function IntegrationLogo({ id }: { id: string }) {
  switch (id) {
    case "gtm":
    case "gtm-server":
      return <SimpleIcon icon={siGoogletagmanager} />;
    case "wordpress":
      return <SimpleIcon icon={siWordpress} />;
    case "api":
      return <Webhook className="size-5" />;
    case "zapier":
      return <SimpleIcon icon={siZapier} />;
    case "google-ads":
      return <SimpleIcon icon={siGoogleads} />;
    case "ga4":
      return <SimpleIcon icon={siGoogleanalytics} />;
    case "meta-ads":
      return <SimpleIcon icon={siMeta} />;
    case "microsoft-ads":
      return <Monitor className="size-5" />;
    case "linkedin-ads":
      return <Linkedin className="size-5" />;
    case "bigquery":
      return <SimpleIcon icon={siGooglebigquery} />;
    case "tiktok-ads":
      return <SimpleIcon icon={siTiktok} />;
    case "reddit-ads":
      return <SimpleIcon icon={siReddit} />;
    case "x-ads":
      return <SimpleIcon icon={siX} />;
    case "snapchat-ads":
      return <SimpleIcon icon={siSnapchat} />;
    case "pipedrive":
      return <Target className="size-5" />;
    case "zoho":
      return <SimpleIcon icon={siZoho} />;
    case "odoo":
      return <SimpleIcon icon={siOdoo} />;
    case "monday":
      return <LayoutGrid className="size-5" />;
    case "clickup":
      return <SimpleIcon icon={siClickup} />;
    case "teamleader":
      return <Users className="size-5" />;
    case "recruitee":
      return <UserPlus className="size-5" />;
    default:
      return null;
  }
}
