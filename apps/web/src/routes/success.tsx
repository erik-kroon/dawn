import { createFileRoute, useSearch } from "@tanstack/react-router";

import { optionalStringSearchParam } from "./-team-routing";

export const Route = createFileRoute("/success")({
  component: SuccessPage,
  validateSearch: (search) => ({
    checkout_id: optionalStringSearchParam(search.checkout_id),
  }),
  head: () => ({
    meta: [{ title: "Payment successful | Dawn" }],
  }),
});

function SuccessPage() {
  const { checkout_id } = useSearch({ from: "/success" });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1>Payment Successful!</h1>
      {checkout_id && <p>Checkout ID: {checkout_id}</p>}
    </div>
  );
}
