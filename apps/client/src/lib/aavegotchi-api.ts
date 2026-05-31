interface AavegotchiSprite {
  id: string;
  svg: string;
  back: string;
  left: string;
  right: string;
}

interface SubgraphResponse {
  data: {
    aavegotchis: AavegotchiSprite[];
  };
}

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_AAVEGOTCHI_SVG_SUBGRAPH_URL ||
  'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn';

const SUBGRAPH_QUERY = `
  query GetAavegotchis {
    aavegotchis(where: { svg_not: "" }) {
      id
      left
      right
      svg
      back
    }
  }
`;

export async function fetchRandomAavegotchi(): Promise<AavegotchiSprite | null> {
  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: SUBGRAPH_QUERY,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: SubgraphResponse = await response.json();

    if (!data.data?.aavegotchis?.length) {
      console.warn('No Aavegotchis found in subgraph response');
      return null;
    }

    // Pick a random Aavegotchi
    const randomIndex = Math.floor(
      Math.random() * data.data.aavegotchis.length
    );
    const selectedGotchi = data.data.aavegotchis[randomIndex];

    console.log(
      `🎭 Selected Aavegotchi #${selectedGotchi.id} for player sprite`
    );
    return selectedGotchi;
  } catch (error) {
    console.error('Failed to fetch Aavegotchi data:', error);
    return null;
  }
}

export async function fetchAavegotchiById(
  tokenId: string
): Promise<AavegotchiSprite | null> {
  try {
    const query = `
      query GetAavegotchi($id: String!) {
        aavegotchis(where: { id: $id, svg_not: "" }) {
          id
          left
          right
          svg
          back
        }
      }
    `;

    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { id: tokenId },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: SubgraphResponse = await response.json();

    if (!data.data?.aavegotchis?.length) {
      console.warn(`Aavegotchi #${tokenId} not found or has no SVG`);
      return null;
    }

    return data.data.aavegotchis[0];
  } catch (error) {
    console.error(`Failed to fetch Aavegotchi #${tokenId}:`, error);
    return null;
  }
}
