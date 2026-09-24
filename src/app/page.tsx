import { ImageStudio } from "@/components/image-studio";
import { getPublicConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <ImageStudio config={getPublicConfig()} />;
}
