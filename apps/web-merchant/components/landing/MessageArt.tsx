import Image from "next/image";

/* Photography for the message previews.
   Cropped to 1.91:1, which is what WhatsApp actually renders a template header
   image at. They were 4:3 before, which showed customers a framing they would
   never see — the real message would have been cropped top and bottom. The
   validation in @custva/shared/media warns about exactly this. */

type Props = { className?: string };

export function ArtBrownie({ className = "" }: Props) {
  return (
    <Image
      src="/msg-brownie.jpg"
      alt="Two brownies on a plate, drizzled with chocolate"
      width={736}
      height={385}
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
      height={170}
      sizes="(max-width: 760px) 100vw, 360px"
      className={className}
    />
  );
}
