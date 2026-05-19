import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

const apiUrl = (import.meta.env.VITE_ADMIN_API_URL ?? "").trim();

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: `${apiUrl}/graphql`,
    credentials: "include",
  }),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: "cache-and-network" },
    // 同期ジョブの結果は再取得不要
    mutate: { errorPolicy: "all" },
  },
});
