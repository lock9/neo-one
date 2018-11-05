import * as React from 'react';
import { Box, css, styled } from 'reakit';
import { prop } from 'styled-tools';
import { Markdown } from '../../elements';

const Wrapper = styled(Box)`
  padding-top: 16px;
  padding-bottom: 16px;
  min-width: 0;

  @media (min-width: ${prop('theme.breakpoints.md')}) {
    padding-top: 64px;
    padding-bottom: 64px;
  }
`;

const smallHeaderMargins = css`
  margin-top: 16px;
  margin-bottom: 8px;
`;

const headerMargins = css`
  margin-top: 32px;
  margin-bottom: 24px;
`;

const StyledMarkdown = styled(Markdown)`
  ${prop('theme.fontStyles.body2')};
  ${prop('theme.fonts.axiformaBook')};
  color: ${prop('theme.black')};
  min-width: 0;

  @media (min-width: ${prop('theme.breakpoints.md')}) {
    ${prop('theme.fontStyles.subheading')};
  }

  & h1 {
    ${prop('theme.fontStyles.display2')};
    margin-top: 16px;
    margin-bottom: 24px;

    @media (min-width: ${prop('theme.breakpoints.md')}) {
      ${prop('theme.fontStyles.display3')};
    }
  }

  & h2 {
    ${prop('theme.fontStyles.headline')};
    ${smallHeaderMargins}

    @media (min-width: ${prop('theme.breakpoints.md')}) {
      ${prop('theme.fontStyles.display1')};
      ${headerMargins}
    }
  }

  & h3 {
    ${prop('theme.fontStyles.headline')};
    ${smallHeaderMargins}

    @media (min-width: ${prop('theme.breakpoints.md')}) {
      ${prop('theme.fontStyles.headline')};
      ${headerMargins}
    }
  }

  & h4 {
    ${prop('theme.fontStyles.body2')};
    ${smallHeaderMargins}

    @media (min-width: ${prop('theme.breakpoints.md')}) {
      ${prop('theme.fontStyles.subheading')};
      ${headerMargins}
    }
  }

  & h5 {
    ${prop('theme.fontStyles.body2')};
    ${smallHeaderMargins}

    @media (min-width: ${prop('theme.breakpoints.md')}) {
      ${prop('theme.fontStyles.subheading')};
      ${headerMargins}
    }
  }

  & > p {
    max-width: ${prop('theme.constants.content.maxWidth')};
  }

  & > ol {
    max-width: ${prop('theme.constants.content.maxWidth')};
  }

  & > ul {
    max-width: ${prop('theme.constants.content.maxWidth')};
  }

  &&& > p:nth-child(2) {
    ${prop('theme.fonts.axiformaThin')};
    ${prop('theme.fontStyles.subheading')};
    color: ${prop('theme.gray6')};
    margin-bottom: 16px;
    margin-top: 16px;
    max-width: unset;

    @media (min-width: ${prop('theme.breakpoints.md')}) {
      ${prop('theme.fontStyles.headline')};
      margin-bottom: 40px;
      margin-top: 40px;
    }
  }
`;

interface Props {
  readonly content: string;
}

export const MainContent = ({ content, ...props }: Props) => (
  <Wrapper {...props}>
    <StyledMarkdown source={content} linkColor="accent" light anchors />
  </Wrapper>
);
