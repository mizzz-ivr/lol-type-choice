import { ImageResponse } from "next/og";
import { SocialPreviewImage } from "@/components/SocialPreviewImage";
import {
  SOCIAL_PREVIEW_ALT,
  SOCIAL_PREVIEW_CONTENT_TYPE,
  SOCIAL_PREVIEW_SIZE
} from "@/config/socialPreview";

export const alt = SOCIAL_PREVIEW_ALT;
export const size = SOCIAL_PREVIEW_SIZE;
export const contentType = SOCIAL_PREVIEW_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(<SocialPreviewImage />, SOCIAL_PREVIEW_SIZE);
}
