export interface ColaLabel {
  ttbId: string;
  permitNo: string;
  serialNumber: string;
  completedDate: string;
  fancifulName: string;
  brandName: string;
  origin: string;
  originDesc: string;
  classType: string;
  classTypeDesc: string;
  imageData?: Buffer;
  imageFilename?: string;
}

export interface ColaLabelDetail extends ColaLabel {
  status: string;
  vendorCode: string;
  typeOfApplication: string;
  approvalDate: string;
  plantRegistry?: string;
  companyName?: string;
  address?: string;
}

export interface SeenLabels {
  lastRun: string;
  ttbIds: string[];
}

export interface WebhookPayload {
  content?: string;
  embeds?: WebhookEmbed[];
  username?: string;
  avatar_url?: string;
}

export interface WebhookEmbed {
  title: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: WebhookField[];
  timestamp?: string;
  footer?: {
    text: string;
  };
  image?: {
    url: string;
  };
  thumbnail?: {
    url: string;
  };
}

export interface WebhookField {
  name: string;
  value: string;
  inline?: boolean;
}
