import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowLeft } from "lucide-react";

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
  });

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
          <header className="mb-8">
            <h1 className="text-4xl font-bold mb-4" data-testid="heading-blog-post-title">{post.title}</h1>
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
            <CardContent className="p-8 prose prose-gray dark:prose-invert max-w-none">
              <div
                className="whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: post.content.replace(/\n/g, "<br/>") }}
                data-testid="content-blog-post"
              />
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
