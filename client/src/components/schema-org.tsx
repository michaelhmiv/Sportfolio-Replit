import { useEffect } from "react";

interface SchemaOrgProps {
  schema: Record<string, any> | Record<string, any>[];
}

// Simple hash function for generating stable script IDs
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export function SchemaOrg({ schema }: SchemaOrgProps) {
  useEffect(() => {
    const schemaArray = Array.isArray(schema) ? schema : [schema];
    const schemaString = JSON.stringify(schemaArray);
    const scriptId = `schema-org-${hashString(schemaString)}`;
    
    // Remove any existing script with this ID
    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
      return; // Already exists, no need to re-add
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    script.text = schemaArray.length === 1 ? JSON.stringify(schemaArray[0]) : schemaString;
    document.head.appendChild(script);

    return () => {
      const scriptToRemove = document.getElementById(scriptId);
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [schema]);

  return null;
}

export const schemas = {
  organization: {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Sportfolio",
    "description": "Fantasy sports stock market platform where you can trade player shares like stocks, vest shares, and compete in contests.",
    "url": "https://sportfolio.replit.app",
    "logo": "https://sportfolio.replit.app/favicon.png",
    "sameAs": [],
  },

  website: {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Sportfolio",
    "description": "Trade player shares like stocks. Vest, trade, and compete in fantasy sports contests with real-time pricing.",
    "url": "https://sportfolio.replit.app",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://sportfolio.replit.app/marketplace?search={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  },

  webApplication: {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Sportfolio",
    "description": "Fantasy sports stock market platform",
    "applicationCategory": "GameApplication",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    }
  },

  createArticle: (post: { title: string; excerpt: string; content: string; publishedAt: string; slug: string; authorId?: string }) => ({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.excerpt,
    "articleBody": post.content,
    "datePublished": post.publishedAt,
    "dateModified": post.publishedAt,
    "author": {
      "@type": "Person",
      "name": "Sportfolio Team"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Sportfolio",
      "logo": {
        "@type": "ImageObject",
        "url": "https://sportfolio.replit.app/favicon.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://sportfolio.replit.app/blog/${post.slug}`
    }
  }),

  createPlayer: (player: { name: string; team: string; position: string; id: string }) => ({
    "@context": "https://schema.org",
    "@type": "Person",
    "name": player.name,
    "jobTitle": "Professional Basketball Player",
    "memberOf": {
      "@type": "SportsTeam",
      "name": player.team
    },
    "url": `https://sportfolio.replit.app/player/${player.id}`
  }),

  createSportsEvent: (contest: { title: string; gameDate: string; entryFee: string; prizePool: string; id: string }) => ({
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": contest.title,
    "startDate": contest.gameDate,
    "offers": {
      "@type": "Offer",
      "price": contest.entryFee,
      "priceCurrency": "USD"
    },
    "url": `https://sportfolio.replit.app/contest/${contest.id}/leaderboard`
  }),

  faqPage: (faqs: Array<{ question: string; answer: string }>) => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  }),

  breadcrumbList: (items: Array<{ name: string; url: string }>) => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url
    }))
  })
};
