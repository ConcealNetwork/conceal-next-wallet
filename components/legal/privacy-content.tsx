import Link from "next/link";

export function PrivacyContent() {
  return (
    <article className="prose prose-invert max-w-none">
      <header className="not-prose mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-muted-foreground">Please read carefully.</p>
      </header>

      <p>English version:</p>

      <h3>1. Your Personal Information.</h3>
      <p>
        This application does not require registration. No personal information is collected,
        retained, or requested. Location access is not sought. No person from the Publisher or those
        affiliated with the Conceal Network Project will ever request your data, keys, donations, or
        information relating to your wallet&apos;s security or usage.
      </p>

      <h3>2. Camera</h3>
      <p>
        Your camera will only be used for reading QR codes and only if you choose to use the
        feature. QR code images are used by the wallet to help import address data. This wallet will
        never retain camera images and only activate your camera upon request.
      </p>

      <h3>3. Private Keys</h3>
      <p>
        Your private key/mnemonic phrase are the only way you can access your coins in the event of
        losing access to your device. Users are highly encouraged to backup and safeguard their
        key/phrase. The wallet publisher does not have the ability to recover your wallet in the
        event of a loss or hack.
      </p>

      <h3>4. Blockchain Transactions</h3>
      <p>
        Your transactions made using this wallet are relayed through a decentralized, global
        computational network. The recipient(s) and amount(s) of the transactions are not publicly
        visible. The wallet&apos;s underlying operation does not take place on a centralized server.
        In considering this wallet and how transactions are processed, users should understand there
        is no entity with the ability to revert transactions or stop those that are pending. Users
        should be incredibly detailed when inputting addresses and amounts as once the transaction
        is authorized, it is final in every sense.
      </p>

      <h3>5. Usage Statistics</h3>
      <p>
        As your wallet interactions do not take place on a server, there is no record of your
        statistics, balances, transactions, nor application activity.
      </p>

      <h3>6. Support Requests</h3>
      <p>
        As a volunteer driven project, there is no group responsible for providing support for the
        wallet. However, helpful community members will often assist others, on their own volition,
        in a dedicated channel within the Conceal Community. Anyone can join at{" "}
        <a href="https://discord.conceal.network">https://discord.conceal.network</a>
      </p>

      <h3>7. More Info</h3>
      <p>
        This wallet is based on the client side{" "}
        <a href="https://wallet.conceal.network">wallet.conceal.network</a>. Terms of use and
        further information can be found there. The mobile wallet Publisher is producing this
        application to the benefit of the Conceal Community. It is completely open source and can be
        replicated by any project. Licensing and other documentation is available on GitHub at{" "}
        <a href="https://github.com/ConcealNetwork/conceal-web-wallet">
          https://github.com/ConcealNetwork/conceal-web-wallet
        </a>
        .
      </p>

      <h3>8. Terms of use</h3>
      <p>
        By using this application, you also agree to the <Link href="/terms">terms of use</Link>.
      </p>
    </article>
  );
}
