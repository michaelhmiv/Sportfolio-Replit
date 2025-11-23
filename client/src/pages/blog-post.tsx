import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect } from "react";
import { SchemaOrg, schemas } from "@/components/schema-org";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  publishedAt: string;
  createdAt: string;
}

interface Author {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug || "";

  const { data, isLoading, error } = useQuery<{ post: BlogPost; author: Author | null }>({
    queryKey: ["/api/blog", slug],
    enabled: !!slug,
    queryFn: async () => {
      const response = await fetch(`/api/blog/${slug}`);
      if (!response.ok) {
        throw new Error('Failed to fetch blog post');
      }
      return response.json();
    },
  });

  // Update page meta tags for SEO - MUST be before any early returns to follow Rules of Hooks
  useEffect(() => {
    if (!data?.post) return;
    
    // Update title
    document.title = `${data.post.title} | Sportfolio Blog`;
    
    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', data.post.excerpt);
    }
    
    // Add Open Graph tags for social sharing
    const ogTags = [
      { property: 'og:title', content: data.post.title },
      { property: 'og:description', content: data.post.excerpt },
      { property: 'og:type', content: 'article' },
      { property: 'og:url', content: `${window.location.origin}/blog/${data.post.slug}` },
      { property: 'article:published_time', content: data.post.publishedAt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: data.post.title },
      { name: 'twitter:description', content: data.post.excerpt },
    ];
    
    ogTags.forEach(tag => {
      const property = (tag.property || tag.name) as string;
      const attr = tag.property ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attr}="${property}"]`);
      
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, property);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', tag.content);
    });
    
    // Cleanup - reset to default on unmount
    return () => {
      document.title = 'Sportfolio - Fantasy Sports Stock Market';
    };
  }, [data?.post?.id, data?.post?.title, data?.post?.excerpt, data?.post?.slug, data?.post?.publishedAt]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <h2 className="text-2xl font-bold mb-4">Blog Post Not Found</h2>
              <p className="text-muted-foreground mb-6">
                The blog post you're looking for doesn't exist or has been removed.
              </p>
              <Link href="/blog">
                <Button>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Blog
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { post, author } = data;

  return (
    <div className="min-h-screen bg-background">
      <SchemaOrg schema={schemas.createArticle({
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        publishedAt: post.publishedAt,
        slug: post.slug,
        authorId: author?.id
      })} />
      <div className="max-w-3xl mx-auto p-6 md:p-12">
        {/* Back Button */}
        <Link href="/blog">
          <Button variant="ghost" className="gap-2 mb-6" data-testid="button-back-to-blog">
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Button>
        </Link>

        {/* Article */}
        <article data-testid="article-blog-post">
          <header className="mb-6">
            <h1 className="text-2xl font-bold mb-3" data-testid="heading-blog-post-title">{post.title}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(post.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
              {author && (
                <div className="flex items-center gap-1">
                  <span>by</span>
                  <span className="font-medium">
                    {author.firstName && author.lastName
                      ? `${author.firstName} ${author.lastName}`
                      : author.username}
                  </span>
                </div>
              )}
            </div>
          </header>

          <Card>
            <CardContent className="p-6 prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                data-testid="content-blog-post"
              >
                {post.content}
              </ReactMarkdown>
            </CardContent>
          </Card>
        </article>

        {/* Back Button (bottom) */}
        <div className="mt-12">
          <Link href="/blog">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Blog
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
