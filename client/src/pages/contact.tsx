import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, MessageCircle } from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { Button } from "@/components/ui/button";

export default function Contact() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 md:p-12">
        <h1 className="text-4xl font-bold mb-4" data-testid="heading-contact">Contact Us</h1>
        <p className="text-lg text-muted-foreground mb-12">
          Get in touch with the Sportfolio team
        </p>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SiDiscord className="w-5 h-5 text-primary" />
                Discord Community
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                The fastest way to get support, ask questions, or connect with other Sportfolio users is through our Discord community. Our team and experienced community members are active daily to help answer questions and discuss the platform.
              </p>
              <Button 
                onClick={() => window.open('https://discord.gg/sportfolio', '_blank')}
                className="gap-2"
                data-testid="button-join-discord"
              >
                <SiDiscord className="w-4 h-4" />
                Join Discord Server
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Support Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Our community and support team can help with:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Account issues and technical support</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Trading questions and platform features</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Contest rules and scoring clarifications</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Feature requests and feedback</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Bug reports and platform improvements</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                <strong>Primary Support Channel:</strong> Discord Community Server
              </p>
              <p className="text-muted-foreground">
                <strong>Email Inquiries:</strong> For business partnerships, press inquiries, or other formal communications, you may reach us via our Discord server where we can coordinate appropriate channels for your needs.
              </p>
              <p className="text-muted-foreground">
                <strong>Service Location:</strong> Sportfolio is a digital platform operating online. All support and communication is conducted through our online channels.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Response Times</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                We strive to respond to all inquiries within 24-48 hours. For urgent issues, Discord is your best option for the fastest response from our team and community. Our community managers and support team monitor Discord channels daily during business hours (Monday-Friday, 9 AM - 6 PM EST).
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
