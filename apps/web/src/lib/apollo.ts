import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

const apiUrl = import.meta.env.VITE_API_URL ?? "";

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: `${apiUrl}/graphql`,
    credentials: "include", // httpOnly Cookie を含める
  }),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: "cache-and-network" },
  },
});

export function imgUrl(p: string): string {
  return `${apiUrl}${p}`;
}
