import Image from "next/image";

/* Photography for the message previews.
   Both are cropped to 4:3 so the two cards line up, and sized down from the
   originals. Meta recommends a landscape header image on template messages,
   which is why the crop is landscape rather than square. */

type Props = { className?: string };

export function ArtBrownie({ className = "" }: Props) {
  return (
    <Image
      src="/msg-brownie.jpg"
      alt="Two brownies on a plate, drizzled with chocolate"
      width={736}
      height={552}
      sizes="(max-width: 760px) 100vw, 360px"
      className={className}
    />
  );
}

export function ArtCoffee({ className = "" }: Props) {
  return (
    <Image
      src="/msg-coffee.jpg"
      alt="A cup of coffee on a saucer, still steaming"
      width={325}
      height={244}
      sizes="(max-width: 760px) 100vw, 360px"
      className={className}
    />
  );
}
