import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 md:p-12">
        <h1 className="text-4xl font-bold mb-8" data-testid="heading-privacy">Privacy Policy</h1>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Information We Collect</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Sportfolio collects information you provide when you create an account, including your email address, username, and profile information through authentication providers. We also collect data about your platform usage, including trading activity, contest participation, and portfolio performance.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How We Use Your Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                We use your information to provide and improve Sportfolio's services, including processing trades, managing contests, calculating leaderboards, and personalizing your experience. Your data helps us maintain platform security, prevent fraud, and communicate important updates about your account and the platform.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                We implement industry-standard security measures to protect your personal information. All sensitive data is encrypted in transit and at rest. Your authentication is managed through secure OAuth providers, and we never store your passwords directly.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Third-Party Services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Sportfolio uses third-party services including authentication providers, analytics tools, and sports data APIs (MySportsFeeds) to deliver our services. These providers have their own privacy policies and data handling practices.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Rights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                You have the right to access, modify, or delete your personal information. You can update your profile information at any time through your account settings. For data deletion requests or privacy concerns, please contact our support team.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cookies and Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Sportfolio uses cookies and similar tracking technologies to maintain your login session, remember your preferences (such as dark mode settings), and analyze platform usage through analytics services. Essential cookies are required for the platform to function properly. You can control cookie settings through your browser, though disabling certain cookies may impact platform functionality.
              </p>
              <p className="text-muted-foreground">
                We use Google Analytics to understand how users interact with Sportfolio, helping us improve the platform experience. Analytics data is aggregated and does not personally identify individual users.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Retention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                We retain your account information and activity data for as long as your account remains active. Trading history, contest participation, and portfolio records are maintained to provide ongoing access to your activity timeline and historical performance data.
              </p>
              <p className="text-muted-foreground">
                If you wish to delete your account, please contact our support team through Discord. Upon account deletion, your personal information will be removed from our active systems, though certain data may be retained for legal compliance or fraud prevention purposes.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Children's Privacy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Sportfolio is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that a user under 13 has provided us with personal information, we will take steps to delete such information from our systems.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Changes to This Policy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                We may update this Privacy Policy periodically to reflect changes in our practices or legal requirements. Significant changes will be communicated through the platform or via email. Your continued use of Sportfolio after policy updates constitutes acceptance of the revised terms.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Us</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                For questions about this Privacy Policy, data access requests, or privacy concerns, please contact us through:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Discord community server (fastest response)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Contact form on our website</span>
                </li>
              </ul>
              <p className="text-muted-foreground">
                We are committed to addressing your privacy concerns and will respond to all inquiries within 48 hours.
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
