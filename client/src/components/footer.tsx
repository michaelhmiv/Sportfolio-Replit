import { Link } from "wouter";
import { SiDiscord } from "react-icons/si";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-sidebar border-t mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Company */}
          <div>
            <h3 className="font-semibold mb-4 text-sm">Company</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link 
                  href="/about" 
                  className="text-muted-foreground hover:text-foreground transition-colors" 
                  data-testid="link-footer-about"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link 
                  href="/contact" 
                  className="text-muted-foreground hover:text-foreground transition-colors" 
                  data-testid="link-footer-contact"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link 
                  href="/blog" 
                  className="text-muted-foreground hover:text-foreground transition-colors" 
                  data-testid="link-footer-blog"
                >
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-semibold mb-4 text-sm">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link 
                  href="/how-it-works" 
                  className="text-muted-foreground hover:text-foreground transition-colors" 
                  data-testid="link-footer-how-it-works"
                >
                  How It Works
                </Link>
              </li>
              <li>
                <Link 
                  href="/marketplace" 
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Marketplace
                </Link>
              </li>
              <li>
                <Link 
                  href="/contests" 
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Contests
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold mb-4 text-sm">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link 
                  href="/privacy" 
                  className="text-muted-foreground hover:text-foreground transition-colors" 
                  data-testid="link-footer-privacy"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link 
                  href="/terms" 
                  className="text-muted-foreground hover:text-foreground transition-colors" 
                  data-testid="link-footer-terms"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h3 className="font-semibold mb-4 text-sm">Community</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://discord.gg/sportfolio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
                  data-testid="link-footer-discord"
                >
                  <SiDiscord className="w-4 h-4" />
                  Discord
                </a>
              </li>
              <li>
                <Link 
                  href="/leaderboards" 
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Leaderboards
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p>© {currentYear} Sportfolio. All rights reserved.</p>
            <p className="text-center md:text-right">
              Trade NBA player shares like stocks. Compete in fantasy contests.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
