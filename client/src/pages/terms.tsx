import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 md:p-12">
        <h1 className="text-4xl font-bold mb-8" data-testid="heading-terms">Terms of Service</h1>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Acceptance of Terms</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                By accessing and using Sportfolio, you accept and agree to be bound by these Terms of Service. Sportfolio is a fantasy sports platform where you trade virtual shares representing NBA players and compete in skill-based contests. All transactions use virtual currency with no real monetary value.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Accounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                You must create an account to use Sportfolio's features. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. You must be at least 13 years old to use this platform.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Virtual Currency & Trading</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Sportfolio uses virtual currency for all trades and contests. Virtual currency has no real-world monetary value and cannot be exchanged for real money or prizes. All trading activity is for entertainment purposes only. Player share prices fluctuate based on market activity and performance.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contest Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Contests on Sportfolio are skill-based competitions where users create lineups of NBA players to compete for virtual prizes. Contest results are determined by real NBA player performance. Entry fees and prizes are denominated in virtual currency only.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Conduct</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Users must not engage in cheating, exploitation of bugs, harassment of other users, or any activity that disrupts platform operations. We reserve the right to suspend or terminate accounts that violate these terms.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data & Privacy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Your use of Sportfolio is also governed by our Privacy Policy. We collect and use data as described in that policy to provide and improve our services.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Intellectual Property</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                All content on Sportfolio, including text, graphics, logos, code, and software, is the property of Sportfolio or its licensors and is protected by copyright and intellectual property laws. You may not reproduce, distribute, or create derivative works from Sportfolio content without explicit permission.
              </p>
              <p className="text-muted-foreground">
                NBA player names, statistics, and related data are used under license from MySportsFeeds. Player performance data is provided for entertainment and informational purposes only.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Limitation of Liability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Sportfolio is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the platform, including but not limited to loss of data, interruption of service, or any other commercial damages or losses.
              </p>
              <p className="text-muted-foreground">
                Virtual currency on Sportfolio has no monetary value. We are not responsible for any perceived value or loss of virtual assets within the platform.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Termination</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                We reserve the right to suspend or terminate accounts that violate these terms, engage in fraudulent activity, or disrupt platform operations. You may also request account deletion at any time by contacting our support team.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dispute Resolution</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Any disputes arising from your use of Sportfolio will be resolved through binding arbitration. You agree to waive your right to participate in class action lawsuits against Sportfolio.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Modifications</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                We reserve the right to modify these Terms of Service at any time. We will notify users of significant changes via email or platform announcement. Continued use of the platform after changes constitutes acceptance of the modified terms.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                If you have questions about these Terms of Service, please contact us through our Discord community or contact page. We will respond to all inquiries within 48 hours.
              </p>
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground mt-8">
          Last updated: November 21, 2025
        </p>
      </div>
    </div>
  );
}
