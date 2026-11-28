import animalsIcon from "../assets/felt-icons/animals.svg";
import clothingIcon from "../assets/felt-icons/clothing-and-accessories.svg";
import familyIcon from "../assets/felt-icons/family-and-relationships.svg";
import foodIcon from "../assets/felt-icons/food-and-drinks.svg";
import objectsIcon from "../assets/felt-icons/objects-and-tools.svg";
import peopleIcon from "../assets/felt-icons/people.svg";
import placesIcon from "../assets/felt-icons/places.svg";

const SUBJECT_ICON: Record<string, string> = {
  "people": "🧑‍🤝‍🧑",
  "family-and-relationships": "👨‍👩‍👧",
  "places": "🏙️",
  "food-and-drinks": "🍎",
  "clothing-and-accessories": "👕",
  "animals": "🐾",
  "objects-and-tools": "🧰",
};

export function topicIcon(slug: string): string {
  return SUBJECT_ICON[slug] ?? "📘";
}

const TOPIC_IMAGE: Record<string, string> = {
  "people": peopleIcon,
  "family-and-relationships": familyIcon,
  "places": placesIcon,
  "food-and-drinks": foodIcon,
  "clothing-and-accessories": clothingIcon,
  "animals": animalsIcon,
  "objects-and-tools": objectsIcon,
};

export function topicImage(slug: string): string | undefined {
  return TOPIC_IMAGE[slug];
}
