export interface Source {
  youtube_url: string;
  timestamp: string;
  text: string;
}

export interface Message {
  role: "user" | "bot";
  content: string;
  sources?: Source[];
}
