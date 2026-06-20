import type { BusinessFlowProfileId } from "@pos/domain/business-flows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function UnsupportedPOSFlow({ profile }: { profile: BusinessFlowProfileId | "unknown" | null | undefined }) {
  return (
    <div className="min-h-screen bg-background p-6 flex items-center justify-center" data-testid="unsupported-pos-flow">
      <Card className="max-w-xl w-full">
        <CardHeader>
          <CardTitle>Workflow POS belum tersedia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Profil bisnis <span className="font-semibold text-foreground">{profile ?? "unknown"}</span> belum memiliki adapter POS aktif.</p>
          <p>Gunakan profil retail atau restaurant table service yang sudah didukung, atau lanjutkan implementasi adapter khusus pada fase berikutnya.</p>
        </CardContent>
      </Card>
    </div>
  );
}
