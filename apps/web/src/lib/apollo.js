import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
/**
 * API のベースURL。
 *
 * - VITE_API_URL が空文字 or 未設定 → "" → ブラウザがページを読み込んだのと同じオリジンへ相対パスで送る
 *   (nginx が /graphql /img を api コンテナにプロキシする)
 *   これにより 社内LAN (192.168.40.99:8080) でも外部DDNS (dirs.synology.me:8080) でも
 *   ユーザーが入ってきた経路に対してそのまま投げ返すので、何も意識せず動く。
 *
 * - 明示的に絶対URLを設定したい場合のみ VITE_API_URL=http://hostname:port を指定する。
 *   ただしこのケースは経路を1つに固定するので、複数経路を切り替えるシステムでは推奨しない。
 */
const apiUrl = (import.meta.env.VITE_API_URL ?? "").trim();
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
export function imgUrl(p) {
    return `${apiUrl}${p}`;
}
