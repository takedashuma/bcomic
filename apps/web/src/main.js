import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { ApolloProvider } from "@apollo/client";
import { RouterProvider } from "@tanstack/react-router";
import { apolloClient } from "./lib/apollo";
import { router } from "./router";
import "./index.css";
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(ApolloProvider, { client: apolloClient, children: _jsx(RouterProvider, { router: router }) }) }));
