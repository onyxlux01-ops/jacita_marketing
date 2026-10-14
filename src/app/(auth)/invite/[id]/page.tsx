import { AcceptInvite } from "./accept-invite"

export default async function InvitePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AcceptInvite inviteId={id} />
}
