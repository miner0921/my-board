import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      username?: string;
      role?: "user" | "admin";
      mustChangePassword?: boolean;
    };
  }

  interface User {
    id?: string;
    username?: string;
    role?: "user" | "admin";
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: "user" | "admin";
    mustChangePassword?: boolean;
  }
}
